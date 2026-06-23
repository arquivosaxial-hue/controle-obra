#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parser_medicao_bpirai.py
========================
Lê a planilha de MEDIÇÃO da obra de Barra do Piraí (.xlsb, modelo do órgão) e
produz, de forma automática, duas saídas:

  1) avanco_servicos.json  -> % de avanço por serviço (drenagem, pavimentação,
     PV/galeria etc.), no formato Contrato / Medido acumulado / % / Saldo.
     -> alimenta o PAINEL DE % POR SERVIÇO.

  2) rede_reconstruida_pv.geojson -> rede de drenagem reconstruída ligando, para
     cada trecho da planilha (par PV jusante -> PV montante), as coordenadas
     reais dos PVs extraídas do DXF do projeto.
     -> alimenta o MAPA (trechos já rotulados com nome real PV-X -> PV-Y).

ESCOPO ATUAL: Bairro de Fátima (aba 'ANEXO I _FÁTIMA_DRE').
Estruturado para EXPANDIR: ver dicionário OBRAS abaixo — basta acrescentar
a aba e o DXF de Assis Ribeiro / Ciclovia quando estiverem prontos.

HONESTIDADE TÉCNICA / LIMITES CONHECIDOS
----------------------------------------
- A planilha mede QUANTIDADE por SERVIÇO (m³, m, m²), NÃO marca "trecho X = 60%".
  Por isso o % por serviço é automático; a pintura por trecho usa esta rede como
  base, mas o percentual de cada trecho ainda precisa de regra/operador.
- O casamento PV-planilha x PV-DXF é por NOME de PV. No teste com Fátima,
  61/65 trechos casaram. Os que não casam caem em 'pendentes' (não somem):
    * montante que não é PV (deságue / referência de desenho);
    * PV citado na planilha sem rótulo no DXF.
- Reprojeção UTM/SIRGAS 2000 23S (EPSG:31983) -> WGS84 (EPSG:4326).

DEPENDÊNCIAS: pyxlsb, ezdxf, pyproj
  pip install pyxlsb ezdxf pyproj
"""

import re
import json
import argparse
from pyxlsb import open_workbook

# ----------------------------------------------------------------------------
# Configuração por obra. Para expandir, acrescente entradas aqui.
# ----------------------------------------------------------------------------
OBRAS = {
    "fatima": {
        "aba_drenagem": "ANEXO I _FÁTIMA_DRE",
        "dxf": None,  # caminho do DXF; passe via --dxf na linha de comando
        # colunas (1-indexadas) na aba de drenagem:
        "col_logradouro": 3,
        "col_extensao": 4,
        "col_pv_jusante": 5,
        "col_pv_montante": 6,
        "col_diametro": 11,
        "primeira_linha_dados": 5,  # índice 0-based onde começam os trechos
    },
    # "assis":   {... ANEXO II ...},
    # "ciclovia":{... ANEXO PAV/respectivo ...},
}

ABA_RESUMO = "RESUMO"
RESUMO_HEADER_ROW = 22   # 0-based
RESUMO_COLS = {"item": 1, "descricao": 3, "contrato": 4,
               "med_anterior": 5, "med_periodo": 6, "med_acumulado": 7, "saldo": 8}

EPSG_ORIGEM = "EPSG:31983"   # UTM SIRGAS 2000 23S
EPSG_DESTINO = "EPSG:4326"   # WGS84 lat/lon
LAYER_ROTULOS_PV = "PS_PONTOS_IDENTIFICACAO_TXT"


def _rowmap(row):
    """Converte uma linha do pyxlsb em dict {coluna: valor}."""
    return {c.c: c.v for c in row}


def normaliza_pv(s):
    """'PV-19', 'PV19', 'pv 019' -> 'PV-19'. Retorna None se não for PV."""
    if not isinstance(s, str):
        return None
    m = re.search(r'PV[\s\-_]?0*(\d+)', s, re.I)
    return f"PV-{int(m.group(1))}" if m else None


# ----------------------------------------------------------------------------
# 1) Avanço por serviço (para o painel de %)
# ----------------------------------------------------------------------------
def extrai_avanco_servicos(xlsb_path):
    with open_workbook(xlsb_path) as wb:
        with wb.get_sheet(ABA_RESUMO) as sh:
            rows = list(sh.rows())
    servicos = []
    for r in rows[RESUMO_HEADER_ROW + 1:]:
        d = _rowmap(r)
        item = d.get(RESUMO_COLS["item"])
        desc = d.get(RESUMO_COLS["descricao"])
        contr = d.get(RESUMO_COLS["contrato"])
        if not (isinstance(item, (int, float)) and isinstance(desc, str)
                and isinstance(contr, (int, float)) and contr > 0):
            continue
        macum = d.get(RESUMO_COLS["med_acumulado"]) or 0
        servicos.append({
            "item": int(item),
            "servico": desc.strip(),
            "contrato": round(contr, 2),
            "medido_anterior": round(d.get(RESUMO_COLS["med_anterior"]) or 0, 2),
            "medido_periodo": round(d.get(RESUMO_COLS["med_periodo"]) or 0, 2),
            "medido_acumulado": round(macum, 2),
            "saldo": round(d.get(RESUMO_COLS["saldo"]) or 0, 2),
            "pct": round(macum / contr * 100, 1),
        })
    return servicos


# ----------------------------------------------------------------------------
# 2) Rede reconstruída (para o mapa)
# ----------------------------------------------------------------------------
def carrega_pvs_do_dxf(dxf_path):
    """Extrai {PV-normalizado: (x_utm, y_utm)} dos rótulos do DXF."""
    import ezdxf
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()
    pv_xy = {}
    for e in msp:
        if e.dxf.layer != LAYER_ROTULOS_PV:
            continue
        if e.dxftype() == "TEXT":
            txt = e.dxf.text
        elif e.dxftype() == "MTEXT":
            txt = e.text
        else:
            continue
        n = normaliza_pv(txt)
        if n and n not in pv_xy:
            try:
                pv_xy[n] = (e.dxf.insert.x, e.dxf.insert.y)
            except Exception:
                pass
    return pv_xy


def reconstroi_rede(xlsb_path, dxf_path, obra="fatima"):
    from pyproj import Transformer
    cfg = OBRAS[obra]
    tr = Transformer.from_crs(EPSG_ORIGEM, EPSG_DESTINO, always_xy=True)
    pv_xy = carrega_pvs_do_dxf(dxf_path)

    with open_workbook(xlsb_path) as wb:
        with wb.get_sheet(cfg["aba_drenagem"]) as sh:
            rows = list(sh.rows())

    feats, pendentes = [], []
    for r in rows[cfg["primeira_linha_dados"] - 1:]:
        d = _rowmap(r)
        jus_raw = d.get(cfg["col_pv_jusante"])
        mon_raw = d.get(cfg["col_pv_montante"])
        if not (isinstance(jus_raw, str) and jus_raw.upper().startswith("PV")):
            continue
        jus, mon = normaliza_pv(jus_raw), normaliza_pv(mon_raw)
        ext = d.get(cfg["col_extensao"])
        diam = d.get(cfg["col_diametro"])
        logr = d.get(cfg["col_logradouro"])

        if jus in pv_xy and mon in pv_xy:
            a = tr.transform(*pv_xy[jus])
            b = tr.transform(*pv_xy[mon])
            feats.append({
                "type": "Feature",
                "properties": {
                    "id": f"{jus}->{mon}", "trecho": f"{jus}->{mon}",
                    "jusante": jus, "montante": mon, "tipo": "tubo",
                    "logradouro": (logr or "").strip(),
                    "diametro_m": diam,
                    "extensao_proj": round(ext, 2) if isinstance(ext, (int, float)) else None,
                    "pct": 0,
                },
                "geometry": {"type": "LineString",
                             "coordinates": [[a[0], a[1]], [b[0], b[1]]]},
            })
        else:
            pendentes.append({"jusante": jus_raw, "montante": mon_raw,
                              "motivo": "PV sem rótulo no DXF ou montante não-PV"})

    return {"type": "FeatureCollection", "features": feats}, pendentes


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Parser de medição - Barra do Piraí")
    ap.add_argument("xlsb", help="Planilha de medição (.xlsb)")
    ap.add_argument("--dxf", help="DXF do projeto (para reconstruir a rede)")
    ap.add_argument("--obra", default="fatima", choices=list(OBRAS.keys()))
    ap.add_argument("--out-servicos", default="avanco_servicos.json")
    ap.add_argument("--out-rede", default="rede_reconstruida_pv.geojson")
    args = ap.parse_args()

    servicos = extrai_avanco_servicos(args.xlsb)
    with open(args.out_servicos, "w", encoding="utf-8") as fh:
        json.dump(servicos, fh, ensure_ascii=False, indent=2)
    print(f"[OK] {len(servicos)} serviços -> {args.out_servicos}")
    for s in servicos:
        print(f"     {s['item']:>2} {s['servico'][:40]:<42} {s['pct']:>5.1f}%")

    if args.dxf:
        rede, pendentes = reconstroi_rede(args.xlsb, args.dxf, args.obra)
        with open(args.out_rede, "w", encoding="utf-8") as fh:
            json.dump(rede, fh, ensure_ascii=False)
        print(f"\n[OK] {len(rede['features'])} trechos reconstruídos -> {args.out_rede}")
        if pendentes:
            print(f"[ATENÇÃO] {len(pendentes)} trecho(s) não casaram (ajuste manual):")
            for p in pendentes:
                print(f"     {p['jusante']} -> {p['montante']}  ({p['motivo']})")
    else:
        print("\n[i] DXF não informado (--dxf): rede não reconstruída.")


if __name__ == "__main__":
    main()
