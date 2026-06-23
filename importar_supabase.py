#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
importar_supabase.py
====================
Popula o Supabase com os dados reais já validados:
  • obras (contratos)
  • rede de drenagem do Bairro de Fátima (trechos PV→PV + ralos)
  • trechos de pavimentação (segmentos × camadas)
  • avanço por serviço (da medição)

PRÉ-REQUISITOS
  1. Schema rodado no Supabase: supabase_schema.sql + supabase_schema_extensao.sql
  2. pip install supabase
  3. Variáveis de ambiente (NUNCA commitar a service_role):
       export SUPABASE_URL="https://xxxx.supabase.co"
       export SUPABASE_SERVICE_ROLE="eyJ...."   # só em ambiente seguro!

USO
  python importar_supabase.py \
      --dren rede_reconstruida_pv.geojson \
      --pav  pav_bundle.json \
      --serv avanco_servicos.json \
      --ralos rede_final.geojson

OBS: a service_role ignora RLS (é admin). Use só localmente para o seed.
Para o front (operador/TV) use sempre a chave 'anon', nunca a service_role.
"""
import os, json, argparse, sys

def get_client():
    try:
        from supabase import create_client
    except ImportError:
        sys.exit("Instale o cliente: pip install supabase")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE")
    if not url or not key:
        sys.exit("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE no ambiente.")
    return create_client(url, key)


def upsert_obras(sb):
    obras = [
        {"numero":"4600007952","nome":"RECOMPOSIÇÃO IGUÁ",
         "objeto":"RECOMPOSIÇÃO ASFÁLTICA E NÃO ASFÁLTICA","tipo":"recomposicao",
         "orgao":"Iguá","tem_mapa":False},
        {"numero":"014/2025","nome":"BARRA DO PIRAÍ — BAIRRO DE FÁTIMA",
         "objeto":"DRENAGEM E PAVIMENTAÇÃO","tipo":"tubos",
         "orgao":"SEIOP","bairro":"Bairro de Fátima","tem_mapa":True},
    ]
    sb.table("contratos").upsert(obras, on_conflict="numero").execute()
    # recuperar ids
    res = sb.table("contratos").select("id,numero").execute()
    return {r["numero"]: r["id"] for r in res.data}


def import_drenagem(sb, contrato_id, dren_path, ralos_path):
    dren = json.load(open(dren_path, encoding="utf-8"))
    trechos = []
    for f in dren["features"]:
        p = f["properties"]
        trechos.append({
            "contrato_id": contrato_id, "codigo": p["id"],
            "pv_jusante": p.get("jusante"), "pv_montante": p.get("montante"),
            "logradouro": p.get("logradouro"), "tipo": "tubo",
            "diametro_m": p.get("diametro_m"), "extensao_m": p.get("extensao_proj"),
            "geojson": f["geometry"],
        })
    if ralos_path:
        ral = json.load(open(ralos_path, encoding="utf-8"))
        for i, f in enumerate([x for x in ral["features"] if x["properties"].get("tipo") == "ralo"]):
            trechos.append({
                "contrato_id": contrato_id, "codigo": f"RALO-{i+1}",
                "tipo": "ralo", "extensao_m": f["properties"].get("metros"),
                "geojson": f["geometry"],
            })
    sb.table("drenagem_trechos").upsert(trechos, on_conflict="contrato_id,codigo").execute()
    print(f"  drenagem: {len(trechos)} trechos")


def import_pavimentacao(sb, contrato_id, pav_path):
    pav = json.load(open(pav_path, encoding="utf-8"))
    trechos = []
    for f in pav["eixo"]["features"]:
        p = f["properties"]
        # achar o polígono de asfalto correspondente (mesmo id)
        poly = next((a["geometry"] for a in pav["asfalto"]["features"]
                     if a["properties"]["id"] == p["id"]), None)
        trechos.append({
            "contrato_id": contrato_id, "codigo": p["id"], "rua": p["rua"],
            "trecho_num": p.get("trecho"), "n_trechos": p.get("n_trechos"),
            "larg_caixa_m": p.get("larg_caixa"), "ext_seg_m": p.get("ext_seg"),
            "esp_cbuq_m": p.get("esp_cbuq"), "esp_base_m": p.get("esp_base"),
            "esp_subbase_m": p.get("esp_subbase"),
            "geojson": f["geometry"], "poligono": poly,
        })
    sb.table("pavimentacao_trechos").upsert(trechos, on_conflict="contrato_id,codigo").execute()
    print(f"  pavimentação: {len(trechos)} segmentos")


def import_servicos(sb, contrato_id, serv_path):
    serv = json.load(open(serv_path, encoding="utf-8"))
    rows = [{
        "contrato_id": contrato_id, "item": s["item"], "servico": s["servico"],
        "valor_contrato": s["contrato"], "medido_acum": s["medido_acumulado"],
        "pct": s["pct"],
    } for s in serv]
    sb.table("avanco_servicos").upsert(rows, on_conflict="contrato_id,servico").execute()
    print(f"  serviços: {len(rows)} itens")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dren", required=True)
    ap.add_argument("--pav", required=True)
    ap.add_argument("--serv", required=True)
    ap.add_argument("--ralos")
    args = ap.parse_args()

    sb = get_client()
    print("Conectado ao Supabase. Importando…")
    ids = upsert_obras(sb)
    bp = ids.get("014/2025")
    print(f"Obra Barra do Piraí: {bp}")
    import_drenagem(sb, bp, args.dren, args.ralos)
    import_pavimentacao(sb, bp, args.pav)
    import_servicos(sb, bp, args.serv)
    print("Concluído.")


if __name__ == "__main__":
    main()
