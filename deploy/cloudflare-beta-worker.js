// Cloudflare Worker: expoe a beta em genvar.delunalab.dev/beta sem tocar no root.
//
// Encaminha /beta e /beta/* para o site estatico da beta no Render, preservando
// o caminho (o site serve os arquivos sob /beta/*). Qualquer outro caminho segue
// para a origem normal (o TCC), intocado.
//
// Deploy: crie um Worker com este codigo e uma Route
//   genvar.delunalab.dev/beta*  ->  este worker
// (Workers Routes ou, no painel novo, Workers Routes do dominio).

const BETA_ORIGIN = 'https://genvar-beta.onrender.com'

export default {
  async fetch(request) {
    const url = new URL(request.url)

    // /beta sem barra final: redireciona para /beta/ (base do SPA)
    if (url.pathname === '/beta') {
      url.pathname = '/beta/'
      return Response.redirect(url.toString(), 301)
    }

    if (url.pathname === '/beta/' || url.pathname.startsWith('/beta/')) {
      const target = BETA_ORIGIN + url.pathname + url.search
      // Repassa metodo, headers e corpo; o Render responde com o arquivo/SPA.
      const resp = await fetch(target, request)
      // Copia a resposta para poder ajustar headers se necessario.
      return new Response(resp.body, resp)
    }

    // Fora de /beta: nao interfere (TCC).
    return fetch(request)
  },
}
