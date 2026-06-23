// supabase-config.js
// Configuração compartilhada do Supabase para todas as telas.
// A anon key é pública por design (aparece no front); a segurança vem das
// políticas RLS no banco. NUNCA coloque a service_role aqui.
window.SUPA_URL = "https://sokzkgsubenikquggziu.supabase.co";
window.SUPA_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNva3prZ3N1YmVuaWtxdWdneml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMTY1NjIsImV4cCI6MjA5NzU5MjU2Mn0.0tD7CaNOQWSsQHlhk3oeCkmKI0l3g_kmG3uSfruTCKY";

// helper: cria o cliente (precisa do script supabase-js carregado antes)
window.makeSupa = function () {
  return supabase.createClient(window.SUPA_URL, window.SUPA_ANON);
};
