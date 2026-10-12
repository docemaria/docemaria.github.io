// Tela do site: desenha o cardápio a partir do catálogo, monta bolos e kits,
// controla o carrinho e abre o WhatsApp com o pedido. As regras ficam em regras.js.

import * as r from "./regras.js";
import { linhasDoItem, linkWhatsApp, montarMensagem } from "./mensagem.js";
import { criarCarrinho } from "./carrinho.js";

const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (texto) => String(texto).replace(/[&<>"']/g, (c) => ESCAPES[c]);
const dinheiro = r.formatarMoeda;

let cat;
let carrinho;
/** Dados do formulário: só na memória da página, nunca salvos (decisão D2). */
const dados = { nome: "", data: "", hora: "", modo: "", bairro: "", bairroOutro: "", endereco: "", referencia: "", pagamento: "", observacoes: "" };
let tentouEnviar = false;

// ---------- Início ----------

function armazenamento() {
  try {
    const s = window.localStorage;
    s.getItem("teste");
    return s;
  } catch {
    return null;
  }
}

/** Itens salvos que não existem mais no catálogo (preço mudou de estrutura, kit saiu) são descartados. */
function itemValido(item) {
  if (item.tipo === "kit") {
    const kit = cat.kits.find((k) => k.id === item.kitId);
    if (!kit || !item.bolo) return false;
    const soma = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    if (soma(item.salgados) !== soma(kit.salgados) || soma(item.doces) !== soma(kit.doces)) return false;
  } else if (item.tipo === "bolo") {
    const bolo = cat.bolos[item.produto];
    if (!bolo || item.kg < bolo.kgMin || item.kg > bolo.kgMax) return false;
  } else if (item.tipo === "empadao") {
    return Boolean(cat.empadao?.ativo) && cat.empadao.sabores.includes(item.sabor) && Number.isInteger(item.qtd) && item.qtd >= 1 && item.qtd <= cat.empadao.maxPorItem;
  } else if (item.tipo !== "unidade") return false;
  return Number.isFinite(r.precoItem(cat, item));
}

/**
 * No computador do Diego (127.0.0.1), troca fotos pelas de teste de `dados/fotos-locais.json`.
 * Essas fotos não têm licença e ficam fora do Git (D30); no site publicado, nada muda.
 */
async function aplicarFotosLocais() {
  if (!["127.0.0.1", "localhost"].includes(location.hostname)) return;
  try {
    const resposta = await fetch("dados/fotos-locais.json", { cache: "no-cache" });
    if (!resposta.ok) return;
    const { fotos } = await resposta.json();
    for (const [id, src] of Object.entries(fotos)) {
      const bolo = id.startsWith("bolo-") ? cat.bolos[id.slice(5)] : null;
      const produto = [...cat.salgados, ...cat.doces].find((x) => x.id === id);
      if (bolo) bolo.foto = src;
      else if (produto) produto.foto = src;
    }
  } catch {
    // sem fotos locais: usa as do catálogo
  }
}

async function iniciar() {
  try {
    const resposta = await fetch("dados/catalogo.json", { cache: "no-cache" });
    if (!resposta.ok) throw new Error(String(resposta.status));
    cat = await resposta.json();
  } catch {
    $("main").insertAdjacentHTML("afterbegin", `<p class="alerta container" style="margin-top:1rem">Não consegui carregar o cardápio. Recarregue a página ou chame no WhatsApp (81) 98818-6706.</p>`);
    return;
  }
  await aplicarFotosLocais();
  carrinho = criarCarrinho(armazenamento(), itemValido);
  desenharFixos();
  desenharKits();
  desenharBolos();
  desenharUnidades("salgados");
  desenharUnidades("doces");
  desenharEmpadao();
  desenharEpoca();
  ligarEventos();
  ligarAnimacoes();
  carrinho.assinar(aoMudarCarrinho);
  aoMudarCarrinho();
}

// ---------- Cardápio ----------

/** `propria`: foto da Doce Maria (sem o selo "Foto ilustrativa"). */
function foto(src, alt, extra = "", propria = false) {
  const selo = cat.fotos.ilustrativas && !propria ? `<span class="selo-ilustrativa">Foto ilustrativa</span>` : "";
  return `<div class="cartao__foto"><img src="${esc(src)}" alt="${esc(alt)}" width="800" height="600" loading="lazy" decoding="async">${selo}${extra}</div>`;
}

function desenharFixos() {
  const { loja } = cat;
  for (const el of $$("[data-endereco]")) el.textContent = loja.endereco;
  for (const el of $$("[data-link-instagram]")) el.href = `https://www.instagram.com/${loja.instagram}/`;
  for (const el of $$("[data-link-whatsapp]")) {
    el.href = `https://wa.me/${loja.whatsapp}`;
    el.textContent = `WhatsApp ${loja.whatsappExibicao}`;
  }
  if (loja.cnpj) {
    $("[data-cnpj]").textContent = `CNPJ ${loja.cnpj}`;
    $("[data-cnpj]").hidden = false;
  }
  $("[data-ilustrativa]").hidden = !cat.fotos.ilustrativas;
  const maisBarato = Math.min(...cat.kits.map((k) => r.precoKitBase(cat, k)));
  $("[data-kit-minimo]").textContent = `a partir de ${dinheiro(maisBarato)}`;
  $("[data-lista-bairros]").innerHTML = cat.entrega.bairros
    .map((b) => `<tr><td>${esc(b.nome)}</td><td>${dinheiro(b.taxa)}</td></tr>`).join("");
  if (cat.fotos.ilustrativas) {
    const creditos = cat.fotos.creditos
      .filter((c) => c.foto !== "Empadão" || cat.empadao?.ativo)
      .map((c) => `${esc(c.foto)}: <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.autor)}</a> (${esc(c.licenca)})`).join(" · ");
    const proprias = [...cat.salgados, ...cat.doces, ...Object.values(cat.bolos)].filter((p) => p.fotoPropria).map((p) => p.nome.replace(/ de frango.*$/i, "").toLowerCase());
    const lista = proprias.length > 1 ? `${proprias.slice(0, -1).join(", ")} e ${proprias.at(-1)}` : proprias[0];
    const daCasa = proprias.length ? `Fotos da Doce Maria: ${esc(lista)}. As demais` : "Fotos";
    $("[data-creditos]").innerHTML = `<p>${daCasa} são ilustrativas, de banco de imagens, até chegarem as fotos dos nossos produtos. ${creditos}.</p>`;
  }
}

function desenharKits() {
  const decorado = cat.bolos.decorado;
  $("[data-lista-kits]").innerHTML = cat.kits.map((kit) => {
    const preco = r.precoKitBase(cat, kit);
    const salgados = Object.values(kit.salgados).reduce((a, b) => a + b, 0);
    const doces = Object.values(kit.doces).reduce((a, b) => a + b, 0);
    const nomesSalgados = kit.salgadosDoKit.map((id) => r.produto(cat, id).nome.split(" ")[0].toLowerCase()).join(" e ");
    return `
      <article class="cartao cartao--kit">
        ${foto(kit.foto, `Mesa de festa com bolo e docinhos`, `<span class="pessoas"><strong>${kit.pessoas}</strong> pessoas</span>`)}
        <div class="cartao__corpo">
          <h3>${esc(kit.nome)}</h3>
          <p class="por-pessoa">≈ ${dinheiro(preco / kit.pessoas)} por pessoa</p>
          <ul class="kit__lista">
            <li><span aria-hidden="true">🎂</span> ${esc(decorado.nome)} de ${r.formatarKg(kit.boloKg)} (${r.fatias(cat, "decorado", kit.boloKg)})</li>
            <li><span aria-hidden="true">🥟</span> ${salgados} salgados (${esc(nomesSalgados)})</li>
            <li><span aria-hidden="true">🍫</span> ${doces} doces (brigadeiro, beijinho e bem casado)</li>
          </ul>
          <div class="cartao__acoes">
            <p class="cartao__preco">${dinheiro(preco)}</p>
            <button class="botao botao--primario" type="button" data-montar-kit="${esc(kit.id)}">Escolher sabores</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

function desenharBolos() {
  const { decorado, caseiro, noiva } = cat.bolos;
  const cartao = (id, bolo, etiquetas, botao) => `
    <article class="cartao">
      ${foto(bolo.foto, bolo.nome, "", bolo.fotoPropria)}
      <div class="cartao__corpo">
        <h3>${esc(bolo.nome)}</h3>
        <p class="cartao__descricao">${esc(bolo.descricao)}</p>
        <ul class="etiquetas">${etiquetas.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
        <div class="cartao__acoes">
          <p class="cartao__preco">${dinheiro(bolo.precoKg)} <small>o kg · a partir de ${r.formatarKg(bolo.kgMin)}</small></p>
          <button class="botao botao--primario" type="button" data-montar="${id}">${botao}</button>
        </div>
      </div>
    </article>`;
  $("[data-lista-bolos]").innerHTML = [
    cartao("decorado", decorado, [
      "Massa branca ou chocolate", `${decorado.recheios.length} recheios`, "Até 2 recheios",
      decorado.formatos.map((f) => f.nome).join(", "), `1 kg ≈ ${decorado.fatiasPorKg.join(" a ")} fatias`,
    ], "Montar meu bolo"),
    cartao("caseiro", caseiro, caseiro.sabores, "Escolher"),
    cartao("noiva", noiva, ["Glacê mármore", `1 kg ≈ ${noiva.fatiasPorKg.join(" a ")} fatias`], "Escolher"),
  ].join("");
}

function controleQtd(id, plural, editavel) {
  const passo = r.categoriaDe(cat, id) === "doces" ? cat.regras.passoDoces : cat.regras.passoSalgados;
  const valor = editavel
    ? `<input type="number" inputmode="numeric" min="0" step="${passo}" value="0" aria-label="Quantidade de ${esc(plural)}" data-qtd-input>`
    : `<output aria-label="Quantidade de ${esc(plural)}" data-qtd-valor>0</output>`;
  return `<div class="qtd" data-produto="${esc(id)}">
      <button type="button" data-delta="-${passo}" aria-label="Menos ${passo} ${esc(plural)}">−</button>${valor}
      <button type="button" data-delta="${passo}" aria-label="Mais ${passo} ${esc(plural)}">+</button>
    </div>`;
}

function desenharUnidades(categoria) {
  $(`[data-lista-${categoria}]`).innerHTML = cat[categoria].map((p) => `
    <article class="cartao cartao--produto">
      ${foto(p.foto, p.nome, "", p.fotoPropria)}
      <div class="cartao__corpo">
        <h3>${esc(p.nome)}</h3>
        <p class="cartao__preco">${dinheiro(p.preco)} <small>a unidade</small></p>
        <div class="cartao__acoes">
          ${controleQtd(p.id, p.plural, true)}
          <span class="nota" data-subtotal="${esc(p.id)}"></span>
        </div>
      </div>
    </article>`).join("");
}

function desenharEmpadao() {
  const e = cat.empadao;
  if (!e?.ativo) return; // fora do site até a ficha técnica ficar pronta (D34)
  const preco = e.preco == null ? `<p class="cartao__preco">Valor a confirmar <small>pela Doce Maria</small></p>` : `<p class="cartao__preco">${dinheiro(e.preco)} <small>cada</small></p>`;
  $("[data-lista-salgados]").insertAdjacentHTML("beforeend", `
    <article class="cartao cartao--empadao">
      ${foto(e.foto, `${e.nome} ${e.tamanho}`)}
      <div class="cartao__corpo">
        <p class="sobretitulo">Tamanho ${esc(e.tamanho)}</p>
        <h3>${esc(e.nome)}</h3>
        <p class="cartao__descricao">${esc(e.descricao)}</p>
        <ul class="etiquetas">${e.sabores.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        <div class="cartao__acoes">${preco}
          <button class="botao botao--primario" type="button" data-montar="empadao">Escolher sabor</button></div>
      </div>
    </article>`);
}

function desenharEpoca() {
  const { epoca, loja } = cat;
  const link = linkWhatsApp(loja.whatsapp, "Olá, Doce Maria! Vi no site e quero saber sobre os bolos de época.");
  $("[data-epoca]").innerHTML = `
    ${foto(epoca.foto, "Bolo de Natal decorado")}
    <div class="cartao__corpo">
      <p class="sobretitulo">Sob consulta</p>
      <h2 id="t-epoca">${esc(epoca.nome.split(" ").slice(0, -1).join(" "))} <em>${esc(epoca.nome.split(" ").at(-1))}</em></h2>
      <p class="cartao__descricao">${esc(epoca.descricao)}</p>
      <div class="cartao__acoes"><a class="botao botao--secundario" href="${esc(link)}" target="_blank" rel="noopener">Perguntar no WhatsApp</a></div>
    </div>`;
}

// ---------- Salgados e doces avulsos ----------

function mudarQuantidade(id, novo) {
  const antes = carrinho.quantidadeDe(id);
  const passo = r.categoriaDe(cat, id) === "doces" ? cat.regras.passoDoces : cat.regras.passoSalgados;
  const qtd = Math.max(0, Math.min(Math.ceil(novo / passo) * passo, 995)); // sempre de 5 em 5
  carrinho.definirQuantidade(id, qtd);
  if (qtd > antes) aviso(`${r.produto(cat, id).nome}: ${qtd} no pedido`);
}

function passoQuantidade(id, delta, botao) {
  if (delta > 0 && botao && !botao.closest("dialog")) {
    const img = botao.closest(".cartao")?.querySelector(".cartao__foto img");
    if (img) voarParaSacola(img.currentSrc || img.src, img.getBoundingClientRect());
  }
  mudarQuantidade(id, carrinho.quantidadeDe(id) + delta);
}

function sincronizarQuantidades() {
  for (const caixa of $$(".qtd[data-produto]")) {
    const id = caixa.dataset.produto;
    const qtd = carrinho.quantidadeDe(id);
    const input = $("[data-qtd-input]", caixa);
    if (input && document.activeElement !== input && input.value !== String(qtd)) {
      input.value = qtd;
      estalar(input);
    }
    const saida = $("[data-qtd-valor]", caixa);
    if (saida && saida.textContent !== String(qtd)) {
      saida.textContent = qtd;
      estalar(saida);
    }
    $("[data-delta^='-']", caixa).disabled = qtd === 0;
  }
  const q = r.quantidades(cat, carrinho.itens());
  for (const el of $$("[data-progresso]")) {
    const grupo = el.dataset.progresso;
    const minimo = grupo === "doces" ? cat.regras.minimoDoces : cat.regras.minimoSalgados;
    const total = q[grupo];
    el.textContent = total === 0 ? "" : total < minimo
      ? `Você tem ${total} ${grupo} no pedido: faltam ${minimo - total} para o mínimo de ${minimo}.`
      : `✓ ${total} ${grupo} no pedido.`;
    el.className = `progresso ${total === 0 ? "" : total < minimo ? "progresso--falta" : "progresso--ok"}`;
  }
  for (const el of $$("[data-subtotal]")) {
    const qtd = carrinho.quantidadeDe(el.dataset.subtotal);
    el.textContent = qtd ? `= ${dinheiro(r.precoItem(cat, { tipo: "unidade", produto: el.dataset.subtotal, qtd }))}` : "";
  }
}

// ---------- Montador de bolo e de kit ----------

let m = null; // estado do montador aberto

/** Só os campos do bolo decorado (sem tipo, peso ou id do item). */
function camposDoBolo(b) {
  return { massa: b.massa, recheios: [...b.recheios], formato: b.formato, adicionais: [...b.adicionais], topo: Boolean(b.topo), decoracao: b.decoracao ?? "" };
}

function boloPadrao() {
  const d = cat.bolos.decorado;
  return { massa: d.massas[0], recheios: [], formato: d.formatos[0].id, adicionais: [], topo: false, decoracao: "" };
}

function abrirMontador({ produto, kitId, editarId }) {
  const existente = editarId ? carrinho.itens().find((i) => i.id === editarId) : null;
  if (existente?.tipo === "kit" || kitId) {
    const kit = cat.kits.find((k) => k.id === (existente?.kitId ?? kitId));
    m = {
      modo: "kit", kit, editarId,
      bolo: existente ? camposDoBolo(existente.bolo) : boloPadrao(),
      salgados: { ...(existente?.salgados ?? kit.salgados) },
      doces: { ...(existente?.doces ?? kit.doces) },
    };
  } else if (existente?.tipo === "empadao" || produto === "empadao") {
    m = { modo: "empadao", editarId, sabor: existente?.sabor ?? cat.empadao.sabores[0], qtd: existente?.qtd ?? 1 };
  } else {
    const id = existente?.produto ?? produto;
    const base = cat.bolos[id];
    m = { modo: id, editarId, kg: existente?.kg ?? base.kgMin, sabor: existente?.sabor ?? base.sabores?.[0] };
    if (id === "decorado") m.bolo = existente ? camposDoBolo(existente) : boloPadrao();
  }
  const form = $("[data-form-montar]");
  form.innerHTML = htmlMontador();
  atualizarMontador();
  $("#dlg-montar").showModal();
  $(".painel__rolagem", form).scrollTop = 0;
}

function chips(nome, tipo, opcoes, marcados) {
  return `<div class="chips">${opcoes.map((o) => `
    <label class="chip"><input type="${tipo}" name="${nome}" value="${esc(o.valor)}" ${marcados.includes(o.valor) ? "checked" : ""}>
      <span>${esc(o.rotulo)}${o.extra ? ` <small data-extra="${esc(o.valor)}">${esc(o.extra)}</small>` : ""}</span></label>`).join("")}
  </div>`;
}

function htmlBoloDecorado(bolo) {
  const d = cat.bolos.decorado;
  return `
    <fieldset class="grupo"><legend>Massa</legend>
      ${chips("massa", "radio", d.massas.map((x) => ({ valor: x, rotulo: x })), [bolo.massa])}</fieldset>
    <fieldset class="grupo"><legend>Recheio <small>(até ${d.maxRecheios}, sem mudar o preço)</small></legend>
      ${chips("recheio", "checkbox", d.recheios.map((x) => ({ valor: x, rotulo: x })), bolo.recheios)}
      <p class="dica">Quer mais recheios? Combine pelo WhatsApp.</p>
      <p class="erro" data-erro-montar="recheio"></p></fieldset>
    <fieldset class="grupo"><legend>Formato</legend>
      ${chips("formato", "radio", d.formatos.map((f) => ({ valor: f.id, rotulo: f.nome, extra: f.kgMin > d.kgMin ? `a partir de ${r.formatarKg(f.kgMin)}` : "" })), [bolo.formato])}
      <p class="erro" data-erro-montar="formato"></p></fieldset>
    <fieldset class="grupo"><legend>Adicionais <small>(${dinheiro(d.adicionais[0].precoPorKg)} por kg cada)</small></legend>
      ${chips("adicional", "checkbox", d.adicionais.map((a) => ({ valor: a.id, rotulo: a.nome, extra: "+" })), bolo.adicionais)}</fieldset>
    <fieldset class="grupo"><legend>Topo de bolo</legend>
      ${chips("topo", "checkbox", [{ valor: "sim", rotulo: "Quero topo (papel impresso 3D)", extra: `a partir de ${dinheiro(d.topo.aPartirDe)}` }], bolo.topo ? ["sim"] : [])}
      <p class="aviso-topo">O topo precisa de <strong>${cat.regras.antecedenciaTopoDias} dias de antecedência</strong>. O valor depende do tamanho e do número de imagens: você manda uma foto do tema no WhatsApp e a Doce Maria confirma.</p></fieldset>
    <div class="campo"><label for="m-decoracao">Cores ou tema da decoração <small>(cobertura de chantilly)</small></label>
      <input id="m-decoracao" name="decoracao" maxlength="120" placeholder="Ex.: rosa e branco, tema Frozen, nome Ana" value="${esc(bolo.decoracao ?? "")}"></div>`;
}

function htmlDivisao(grupo, titulo, ids, passo) {
  return `<fieldset class="grupo"><legend>${titulo}</legend>
    ${ids.map((id) => {
      const p = r.produto(cat, id);
      return `<div class="linha-qtd"><span>${esc(p.nome)}</span>
        <div class="qtd"><button type="button" data-divisao="${grupo}" data-sabor="${esc(id)}" data-delta="-${passo}" aria-label="Menos ${passo} ${esc(p.plural)}">−</button>
        <output data-valor-divisao="${grupo}:${esc(id)}">0</output>
        <button type="button" data-divisao="${grupo}" data-sabor="${esc(id)}" data-delta="${passo}" aria-label="Mais ${passo} ${esc(p.plural)}">+</button></div></div>`;
    }).join("")}
    <p class="distribuir" data-distribuir="${grupo}"></p></fieldset>`;
}

function htmlMontador() {
  let titulo;
  let corpo = "";
  if (m.modo === "kit") {
    const { kit } = m;
    titulo = `${kit.nome} · ${kit.pessoas} pessoas`;
    corpo = `<p class="nota">Bolo decorado de ${r.formatarKg(kit.boloKg)}, ${soma(kit.salgados)} salgados e ${soma(kit.doces)} doces. Escolha os sabores: o preço do kit não muda (só os adicionais do bolo somam).</p>
      <h3>O bolo</h3>${htmlBoloDecorado(m.bolo)}
      <h3>Os salgados</h3>${htmlDivisao("salgados", `Divida os ${soma(kit.salgados)} salgados`, kit.salgadosDoKit, cat.regras.passoSalgados)}
      <h3>Os doces</h3>${htmlDivisao("doces", `Divida os ${soma(kit.doces)} doces <small>(de ${cat.regras.passoDoces} em ${cat.regras.passoDoces})</small>`, Object.keys(kit.doces), cat.regras.passoDoces)}`;
  } else if (m.modo === "empadao") {
    const e = cat.empadao;
    titulo = `${e.nome} ${e.tamanho}`;
    corpo = `<p class="nota">${esc(e.descricao)}${e.preco == null ? " O valor é confirmado pela Doce Maria no WhatsApp." : ""}</p>
      <fieldset class="grupo"><legend>Sabor</legend>${chips("sabor", "radio", e.sabores.map((s) => ({ valor: s, rotulo: s })), [m.sabor])}</fieldset>
      <fieldset class="grupo"><legend>Quantidade <small>(deste sabor)</small></legend>
        <div class="qtd"><button type="button" data-empadao="-1" aria-label="Menos um empadão">−</button><output data-valor-empadao>${m.qtd}</output>
        <button type="button" data-empadao="1" aria-label="Mais um empadão">+</button></div>
        <p class="dica">Quer sabores diferentes? Adicione um de cada vez.</p></fieldset>`;
  } else {
    const bolo = cat.bolos[m.modo];
    titulo = bolo.nome;
    corpo = `<fieldset class="grupo"><legend>Peso <small>(de ${r.formatarKg(bolo.passoKg)} em ${r.formatarKg(bolo.passoKg)})</small></legend>
        <div class="linha-qtd"><div class="qtd qtd--grande">
          <button type="button" data-kg="-1" aria-label="Menos meio quilo">−</button><output data-valor-kg>${r.formatarKg(m.kg)}</output>
          <button type="button" data-kg="1" aria-label="Mais meio quilo">+</button></div>
          <span class="nota" data-fatias></span></div></fieldset>`;
    if (bolo.sabores) corpo += `<fieldset class="grupo"><legend>Sabor</legend>${chips("sabor", "radio", bolo.sabores.map((s) => ({ valor: s, rotulo: s })), [m.sabor])}</fieldset>`;
    if (m.modo === "decorado") corpo += htmlBoloDecorado(m.bolo);
    else corpo = `<p class="nota">${esc(bolo.descricao)}</p>${corpo}`;
  }
  return `
    <div class="painel__cabeca"><h2 id="montar-titulo">${esc(titulo)}</h2>
      <button type="button" class="painel__fechar" data-fechar aria-label="Fechar">×</button></div>
    <div class="painel__rolagem">${corpo}<p class="alerta" data-erro-montar="geral"></p></div>
    <div class="painel__rodape">
      <div class="painel__total"><span>Total <small data-montar-obs></small></span><span data-montar-preco></span></div>
      <button type="submit" class="botao botao--primario botao--largo">${m.editarId ? "Salvar alterações" : "Adicionar ao pedido"}</button>
    </div>`;
}

const soma = (o) => Object.values(o).reduce((a, b) => a + b, 0);

/** Lê as escolhas do formulário para o estado `m`. */
function lerMontador() {
  const form = $("[data-form-montar]");
  const marcados = (nome) => $$(`input[name="${nome}"]:checked`, form).map((i) => i.value);
  if (m.bolo) {
    m.bolo.massa = marcados("massa")[0] ?? m.bolo.massa;
    m.bolo.recheios = marcados("recheio");
    m.bolo.formato = marcados("formato")[0] ?? m.bolo.formato;
    m.bolo.adicionais = marcados("adicional");
    m.bolo.topo = marcados("topo").length > 0;
    m.bolo.decoracao = form.elements.decoracao?.value ?? "";
  }
  if (m.modo === "caseiro" || m.modo === "empadao") m.sabor = marcados("sabor")[0] ?? m.sabor;
}

function itemDoMontador() {
  if (m.modo === "kit") return { tipo: "kit", kitId: m.kit.id, bolo: camposDoBolo(m.bolo), salgados: { ...m.salgados }, doces: { ...m.doces } };
  if (m.modo === "empadao") return { tipo: "empadao", sabor: m.sabor, qtd: m.qtd };
  const item = { tipo: "bolo", produto: m.modo, kg: m.kg };
  if (m.modo === "caseiro") item.sabor = m.sabor;
  if (m.modo === "decorado") Object.assign(item, camposDoBolo(m.bolo));
  return item;
}

function atualizarMontador() {
  const form = $("[data-form-montar]");
  const kgBolo = m.modo === "kit" ? m.kit.boloKg : m.kg;
  const d = cat.bolos.decorado;

  if (m.modo === "empadao") {
    $("[data-valor-empadao]", form).textContent = m.qtd;
    $("[data-empadao='-1']", form).disabled = m.qtd <= 1;
    $("[data-empadao='1']", form).disabled = m.qtd >= cat.empadao.maxPorItem;
  } else if (m.modo !== "kit") {
    const bolo = cat.bolos[m.modo];
    $("[data-valor-kg]", form).textContent = r.formatarKg(m.kg);
    $("[data-fatias]", form).textContent = `serve ${r.fatias(cat, m.modo, m.kg)}`;
    $("[data-kg='-1']", form).disabled = m.kg <= bolo.kgMin;
    $("[data-kg='1']", form).disabled = m.kg >= bolo.kgMax;
  }
  if (m.bolo) {
    // bolo de andar só com o peso mínimo do formato
    for (const input of $$("input[name='formato']", form)) input.disabled = !r.formatoPermitido(cat, input.value, kgBolo);
    if (!r.formatoPermitido(cat, m.bolo.formato, kgBolo)) {
      m.bolo.formato = d.formatos[0].id;
      $(`input[name='formato'][value='${m.bolo.formato}']`, form).checked = true;
    }
    // no máximo 2 recheios: desabilita os outros quando chega no limite
    const cheio = m.bolo.recheios.length >= d.maxRecheios;
    for (const input of $$("input[name='recheio']", form)) input.disabled = cheio && !input.checked;
    for (const a of d.adicionais) $(`[data-extra="${a.id}"]`, form).textContent = `+${dinheiro(r.precoAdicionais(cat, [a.id], kgBolo))}`;
  }
  if (m.modo === "kit") {
    for (const grupo of ["salgados", "doces"]) {
      const total = soma(m.kit[grupo]);
      const atual = soma(m[grupo]);
      for (const [id, qtd] of Object.entries(m[grupo])) {
        $(`[data-valor-divisao="${grupo}:${id}"]`, form).textContent = qtd;
        $(`[data-divisao="${grupo}"][data-sabor="${id}"][data-delta^="-"]`, form).disabled = qtd === 0;
        $(`[data-divisao="${grupo}"][data-sabor="${id}"]:not([data-delta^="-"])`, form).disabled = grupo === "doces" && atual >= total;
      }
      const el = $(`[data-distribuir="${grupo}"]`, form);
      el.textContent = atual === total ? `✓ ${total} ${grupo} divididos` : `Faltam ${total - atual} ${grupo} para dividir`;
      el.className = `distribuir ${atual === total ? "distribuir--ok" : "distribuir--falta"}`;
    }
  }
  const preco = r.precoItem(cat, itemDoMontador());
  $("[data-montar-preco]", form).textContent = preco === null ? "a confirmar" : dinheiro(preco);
  $("[data-montar-obs]", form).textContent = m.bolo?.topo ? "+ topo a confirmar" : "";
}

/** Kit: salgados têm 2 sabores e o total é fixo, então tirar de um põe no outro. Doces: distribui livremente até o total. */
function mudarDivisao(grupo, sabor, delta) {
  const atual = m[grupo];
  if (grupo === "salgados") {
    const outro = Object.keys(atual).find((id) => id !== sabor);
    if (atual[sabor] + delta < 0 || atual[outro] - delta < 0) return;
    atual[sabor] += delta;
    atual[outro] -= delta;
  } else {
    if (atual[sabor] + delta < 0 || soma(atual) + delta > soma(m.kit.doces)) return;
    atual[sabor] += delta;
  }
  atualizarMontador();
}

function confirmarMontador(evento) {
  evento.preventDefault();
  lerMontador();
  const form = $("[data-form-montar]");
  const erros = {};
  if (m.bolo && m.bolo.recheios.length === 0) erros.recheio = "Escolha pelo menos um recheio.";
  if (m.modo === "kit" && soma(m.doces) !== soma(m.kit.doces)) erros.geral = `Divida todos os ${soma(m.kit.doces)} doces entre os sabores.`;
  for (const el of $$("[data-erro-montar]", form)) el.textContent = erros[el.dataset.erroMontar] ?? "";
  if (Object.keys(erros).length) {
    $(`[data-erro-montar="${Object.keys(erros)[0]}"]`, form).scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  const item = itemDoMontador();
  const origem = $("button[type=submit]", form).getBoundingClientRect();
  const fotoDoItem = m.modo === "kit" ? m.kit.foto : m.modo === "empadao" ? cat.empadao.foto : cat.bolos[m.modo].foto;
  if (m.editarId) carrinho.substituir(m.editarId, item);
  else carrinho.adicionar(item);
  $("#dlg-montar").close();
  if (!m.editarId && !$("#dlg-carrinho").open) voarParaSacola(fotoDoItem, origem);
  aviso(m.editarId ? "Alterações salvas" : "Adicionado ao pedido ✓");
}

// ---------- Carrinho e finalização ----------

function tituloDoItem(item) {
  if (item.tipo === "kit") {
    const kit = cat.kits.find((k) => k.id === item.kitId);
    return `${kit.nome} · ${kit.pessoas} pessoas`;
  }
  if (item.tipo === "bolo") {
    const bolo = cat.bolos[item.produto];
    return `${bolo.nome}${item.sabor ? ` de ${item.sabor.toLowerCase()}` : ""} · ${r.formatarKg(item.kg)}`;
  }
  if (item.tipo === "empadao") return `${cat.empadao.nome} ${cat.empadao.tamanho} · ${item.sabor}`;
  return r.produto(cat, item.produto).nome;
}

function htmlItem(item) {
  const detalhes = item.tipo === "empadao" ? `<li>${item.qtd} ${item.qtd === 1 ? "unidade" : "unidades"}</li>` : linhasDoItem(cat, item).slice(1).map((l) => `<li>${esc(l.trim())}</li>`).join("");
  const acoes = item.tipo === "unidade"
    ? controleQtd(item.produto, r.produto(cat, item.produto).plural, false)
    : `<button type="button" class="botao botao--secundario" data-editar="${esc(item.id)}">Editar</button>`;
  return `<li class="item">
    <div class="item__topo"><p class="item__titulo">${esc(tituloDoItem(item))}</p><span class="item__preco">${r.precoItem(cat, item) === null ? "a confirmar" : dinheiro(r.precoItem(cat, item))}</span></div>
    ${detalhes ? `<ul class="item__detalhes">${detalhes}</ul>` : ""}
    <div class="item__acoes">${acoes}<button type="button" class="botao botao--texto" data-remover="${esc(item.id)}">Remover</button></div>
  </li>`;
}

function opcao(nome, valor, icone, titulo, descricao, destaque = "") {
  return `<label class="opcao"><input type="radio" name="${nome}" value="${valor}" ${dados[nome] === valor ? "checked" : ""}>
    <span class="opcao__caixa"><span aria-hidden="true">${icone}</span><strong>${titulo}</strong>${destaque ? `<em>${destaque}</em>` : "<span></span>"}<small data-desc="${nome}-${valor}">${descricao}</small></span></label>`;
}

function desenharCarrinho() {
  const itens = carrinho.itens();
  const caixa = $("[data-carrinho]");
  const cabeca = `<div class="painel__cabeca"><h2 id="carrinho-titulo">Seu pedido</h2>
    <button type="button" class="painel__fechar" data-fechar aria-label="Fechar">×</button></div>`;
  if (itens.length === 0) {
    caixa.innerHTML = `${cabeca}<div class="painel__rolagem"><div class="vazio"><p aria-hidden="true">🧁</p>
      <p><strong>Seu pedido está vazio.</strong></p><p>Escolha um kit, monte um bolo ou adicione salgados e doces.</p>
      <button type="button" class="botao botao--primario" data-ir-cardapio>Ver cardápio</button></div></div>`;
    return;
  }
  const bairros = cat.entrega.bairros.map((b) => `<option value="${esc(b.nome)}" ${dados.bairro === b.nome ? "selected" : ""}>${esc(b.nome)} · ${dinheiro(b.taxa)}</option>`).join("");
  caixa.innerHTML = `${cabeca}
    <div class="painel__rolagem">
      <ul class="itens">${itens.map(htmlItem).join("")}</ul>
      <p class="alerta" data-erro="itens"></p>
      <form data-form-pedido novalidate>
        <div class="campo" data-campo="nome"><label for="p-nome">Seu nome</label>
          <input id="p-nome" name="nome" autocomplete="name" maxlength="60" value="${esc(dados.nome)}">
          <p class="erro" data-erro="nome"></p></div>

        <fieldset class="grupo" data-campo="horario"><legend>Para quando?</legend>
          <div class="campo--duplo">
            <div class="campo"><label for="p-data">Data</label><input id="p-data" type="date" name="data" value="${esc(dados.data)}"></div>
            <div class="campo"><label for="p-hora">Horário</label><select id="p-hora" name="hora"></select></div>
          </div>
          <p class="dica" data-primeiro></p>
          <p class="erro" data-erro="horario"></p></fieldset>

        <fieldset class="grupo" data-campo="modo"><legend>Como vai receber?</legend>
          <div class="opcoes">
            ${opcao("modo", "retirada", "🏠", "Retirada no Ipsep", esc(cat.loja.endereco), "Grátis")}
            ${opcao("modo", "entrega", "🚗", "Entrega da Doce Maria", `Até ${cat.entrega.raioKm} km do Ipsep. Taxa pelo bairro.`, `a partir de ${dinheiro(cat.entrega.taxaBase)}`)}
            ${opcao("modo", "app", "🚘", "Vou chamar Uber ou 99", "", "")}
          </div>
          <p class="erro" data-erro="modo"></p>
          <div data-so-entrega hidden>
            <div class="campo" data-campo="bairro" style="margin-top:.9rem"><label for="p-bairro">Bairro</label>
              <select id="p-bairro" name="bairro"><option value="">Escolha o bairro</option>${bairros}
                <option value="${r.OUTRO_BAIRRO}" ${dados.bairro === r.OUTRO_BAIRRO ? "selected" : ""}>Outro bairro (taxa a confirmar)</option></select></div>
            <div class="campo" data-so-outro hidden><label for="p-bairro-outro">Qual bairro?</label>
              <input id="p-bairro-outro" name="bairroOutro" maxlength="40" value="${esc(dados.bairroOutro)}"></div>
            <p class="erro" data-erro="bairro"></p>
            <div class="campo" data-campo="endereco"><label for="p-endereco">Rua e número</label>
              <input id="p-endereco" name="endereco" autocomplete="street-address" maxlength="100" value="${esc(dados.endereco)}">
              <p class="erro" data-erro="endereco"></p></div>
            <div class="campo"><label for="p-referencia">Ponto de referência <small>(opcional)</small></label>
              <input id="p-referencia" name="referencia" maxlength="80" value="${esc(dados.referencia)}"></div>
          </div></fieldset>

        <fieldset class="grupo" data-campo="pagamento"><legend>Pagamento</legend>
          <div class="opcoes">
            ${opcao("pagamento", "sinal", "💠", "Sinal de 50% agora", "")}
            ${opcao("pagamento", "integral", "✅", "Pagar 100% agora", "")}
          </div>
          <p class="dica">O Pix é feito depois que a Doce Maria confirmar a data e os valores.</p>
          <p class="erro" data-erro="pagamento"></p></fieldset>

        <div class="campo"><label for="p-obs">Observações <small>(alergia, tema, cores...)</small></label>
          <textarea id="p-obs" name="observacoes" maxlength="300">${esc(dados.observacoes)}</textarea></div>
      </form>
      <div class="resumo" data-resumo aria-live="polite"></div>
      <ul class="combinados--curto">
        <li>Sinal de ${Math.round(cat.regras.sinal * 100)}% no Pix para confirmar; o restante na entrega ou retirada (ou 100% de uma vez).</li>
        <li>Pedido confirmado não pode ser alterado.</li>
        <li>Se desistir, o sinal não é devolvido.</li>
      </ul>
    </div>
    <div class="painel__rodape">
      <button type="button" class="botao botao--primario botao--largo" data-enviar>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19l-4 1Z"/></svg>
        Enviar pedido pelo WhatsApp</button>
      <p class="nota" style="text-align:center;margin:0">Você vê a mensagem antes de enviar.</p>
    </div>`;
  atualizarFormulario();
}

/** Atualiza o que depende das escolhas, sem redesenhar o formulário (não perde o foco de quem digita). */
function atualizarFormulario() {
  const caixa = $("[data-carrinho]");
  const form = $("[data-form-pedido]", caixa);
  if (!form) return;
  const itens = carrinho.itens();
  const q = r.quantidades(cat, itens);
  const agora = r.agoraEmRecife();

  // datas: mínimo pela antecedência (48 h, ou 5 dias com topo)
  const primeiro = r.primeiroHorario(cat, agora, q.temTopo);
  const inputData = form.elements.data;
  inputData.min = r.dataIso(primeiro);
  inputData.max = r.dataIso(new Date(primeiro.getTime() + 120 * 24 * 3600 * 1000));
  $("[data-primeiro]", caixa).textContent = `Primeiro horário livre: ${r.formatarHorario(primeiro)}${q.temTopo ? " (com topo, 5 dias de antecedência)" : ""}. Domingo não abre.`;
  const selectHora = form.elements.hora;
  const horas = dados.data ? r.horasDisponiveis(cat, dados.data, agora, q.temTopo) : [];
  if (!horas.includes(Number(dados.hora))) dados.hora = "";
  selectHora.innerHTML = `<option value="">${dados.data && !horas.length ? "Sem horário" : "Escolha"}</option>`
    + horas.map((h) => `<option value="${h}" ${String(h) === String(dados.hora) ? "selected" : ""}>${h}h</option>`).join("");
  selectHora.disabled = !horas.length;

  // como receber
  $("[data-desc='modo-app']", caixa).textContent = q.temBolo
    ? "Bolo vai de carro, para não amassar. Você paga direto no app."
    : "Moto ou carro. Você paga direto no app.";
  $("[data-so-entrega]", caixa).hidden = dados.modo !== "entrega";
  $("[data-so-outro]", caixa).hidden = dados.bairro !== r.OUTRO_BAIRRO;

  // pagamento: sinal de 50% ou 100%; com Uber/99, só 100%
  const t = r.totais(cat, itens, dados);
  const sinalInput = $("input[name='pagamento'][value='sinal']", form);
  sinalInput.disabled = !r.pagamentosPermitidos(dados.modo || "retirada").includes("sinal");
  if (sinalInput.disabled && dados.pagamento === "sinal") {
    dados.pagamento = "";
    sinalInput.checked = false;
  }
  const sinal = r.valoresPagamento(cat, t.total, "sinal");
  const pendente = t.aConfirmar.length ? " + metade do que estiver a confirmar" : "";
  $("[data-desc='pagamento-sinal']", caixa).textContent = sinalInput.disabled
    ? "Com Uber ou 99, o pagamento é 100% no Pix."
    : `${dinheiro(sinal.agora)} no Pix${pendente}. O resto (${dinheiro(sinal.depois)}) ${dados.modo === "entrega" ? "na entrega" : "na retirada"}, no Pix ou em dinheiro.`;
  $("[data-desc='pagamento-integral']", caixa).textContent = `${dinheiro(t.total)} no Pix${t.aConfirmar.length ? " + o que estiver a confirmar" : ""}.`;

  // resumo
  let linhaEntrega = "";
  if (dados.modo === "entrega") linhaEntrega = `<div><span>Entrega</span><span>${t.taxa === null ? "a confirmar" : `${dinheiro(t.taxa)} (estimada)`}</span></div>`;
  if (dados.modo === "retirada") linhaEntrega = `<div><span>Retirada</span><span>grátis</span></div>`;
  if (dados.modo === "app") linhaEntrega = `<div><span>Uber/99</span><span>você paga no app</span></div>`;
  const pendentes = t.aConfirmar.length ? `<p class="nota" style="margin:0">+ ${t.aConfirmar.join(" e ")} a confirmar pela Doce Maria</p>` : "";
  $("[data-resumo]", caixa).innerHTML = `<div><span>Subtotal</span><span>${dinheiro(t.subtotal)}</span></div>${linhaEntrega}
    <div class="resumo__total"><span>Total</span><span>${dinheiro(t.total)}</span></div>${pendentes}`;

  if (tentouEnviar) mostrarErros(r.validarPedido(cat, itens, dados, agora));
  else $("[data-erro='itens']", caixa).textContent = r.errosDeQuantidade(cat, itens).join(" ");
}

function mostrarErros(erros) {
  const caixa = $("[data-carrinho]");
  for (const el of $$("[data-erro]", caixa)) el.textContent = erros[el.dataset.erro] ?? "";
  for (const el of $$("[data-campo]", caixa)) el.classList.toggle(el.tagName === "FIELDSET" ? "grupo--erro" : "campo--erro", Boolean(erros[el.dataset.campo]));
}

function enviarPedido() {
  tentouEnviar = true;
  const itens = carrinho.itens();
  const erros = r.validarPedido(cat, itens, dados, r.agoraEmRecife());
  mostrarErros(erros);
  const primeiro = Object.keys(erros)[0];
  if (primeiro) {
    const alvo = $(`[data-erro="${primeiro}"]`, $("[data-carrinho]"));
    alvo?.closest(".campo, .grupo, .alerta")?.scrollIntoView({ block: "center", behavior: "smooth" });
    aviso("Falta completar alguns dados");
    return;
  }
  const link = linkWhatsApp(cat.loja.whatsapp, montarMensagem(cat, itens, dados));
  $("[data-link-pedido]").href = link;
  const janela = window.open(link, "_blank");
  if (janela) janela.opener = null;
  else window.location.href = link; // navegador bloqueou a nova aba: abre na mesma
  $("#dlg-carrinho").close();
  $("#dlg-enviado").showModal();
}

function abrirCarrinho() {
  desenharCarrinho();
  sincronizarQuantidades();
  $("#dlg-carrinho").showModal();
}

// ---------- Barra, contador e aviso ----------

function aoMudarCarrinho() {
  const itens = carrinho.itens();
  const total = r.totais(cat, itens, {}).subtotal;
  const n = itens.length;
  const contador = $("[data-contador]");
  contador.hidden = n === 0;
  contador.textContent = n;
  const barra = $("[data-barra]");
  barra.hidden = n === 0;
  document.body.classList.toggle("com-barra", n > 0);
  $("[data-barra-resumo]").textContent = `${n} ${n === 1 ? "item" : "itens"} · ${dinheiro(total)}`;
  if ($("#dlg-carrinho").open) {
    const ativo = document.activeElement;
    const dentroDoForm = ativo?.closest?.("[data-form-pedido]");
    if (dentroDoForm) atualizarFormulario();
    else desenharCarrinho();
  }
  sincronizarQuantidades(); // depois de redesenhar, para os seletores do carrinho também
}

let temporizador;
function aviso(texto) {
  const el = $("[data-aviso]");
  el.textContent = texto;
  el.classList.add("aviso--visivel");
  clearTimeout(temporizador);
  temporizador = setTimeout(() => el.classList.remove("aviso--visivel"), 2200);
}

// ---------- Animações ----------

const menosMovimento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function estalar(el) {
  el.classList.remove("mudou");
  void el.offsetWidth; // reinicia a animação
  el.classList.add("mudou");
}

/** A sacola dá um pulo e solta faíscas rosas quando o produto chega. */
function pularSacola() {
  const sacola = $(".botao-sacola");
  estalar(sacola);
  sacola.classList.remove("pulou");
  void sacola.offsetWidth;
  sacola.classList.add("pulou");
  if (menosMovimento()) return;
  const r0 = sacola.getBoundingClientRect();
  const cx = r0.left + r0.width / 2;
  const cy = r0.top + r0.height / 2;
  for (let i = 0; i < 8; i++) {
    const faisca = document.createElement("span");
    faisca.className = "faisca";
    faisca.style.left = `${cx - 4}px`;
    faisca.style.top = `${cy - 4}px`;
    document.body.append(faisca);
    const angulo = (i / 8) * Math.PI * 2;
    const raio = 30 + Math.random() * 14;
    faisca.animate(
      [{ transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${Math.cos(angulo) * raio}px, ${Math.sin(angulo) * raio}px) scale(0)`, opacity: 0 }],
      { duration: 550, easing: "cubic-bezier(.2,.8,.2,1)" },
    ).onfinish = () => faisca.remove();
  }
}

/**
 * Foto do produto voa numa curva até a sacola do topo.
 * Curva = o eixo X anda com uma aceleração e o eixo Y com outra (dois elementos, um dentro do outro).
 */
function voarParaSacola(src, de) {
  const sacola = $(".botao-sacola");
  if (menosMovimento() || !src || !de) {
    pularSacola();
    return;
  }
  const para = sacola.getBoundingClientRect();
  const tamanho = 72;
  const x0 = de.left + de.width / 2 - tamanho / 2;
  const y0 = de.top + de.height / 2 - tamanho / 2;
  const x1 = para.left + para.width / 2 - tamanho / 2;
  const y1 = para.top + para.height / 2 - tamanho / 2;

  const eixoX = document.createElement("div");
  eixoX.className = "voo";
  eixoX.style.transform = `translate(${x0}px, ${y0}px)`;
  const eixoY = document.createElement("div");
  eixoY.style.cssText = "width:100%;height:100%";
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  eixoY.append(img);
  eixoX.append(eixoY);
  document.body.append(eixoX);

  const duracao = 800;
  eixoX.animate(
    [{ transform: `translate(${x0}px, ${y0}px)` }, { transform: `translate(${x1}px, ${y0}px)` }],
    { duration: duracao, easing: "cubic-bezier(.35, 0, .65, 1)", fill: "forwards" },
  );
  eixoY.animate(
    [{ transform: "translateY(0) scale(.6)", offset: 0 },
      { transform: `translateY(${Math.min(-60, (y1 - y0) * 0.15)}px) scale(1.05)`, offset: 0.25 },
      { transform: `translateY(${y1 - y0}px) scale(.35)`, offset: 1 }],
    { duration: duracao, easing: "cubic-bezier(.55, 0, .85, .4)", fill: "forwards" },
  );
  img.animate([{ transform: "rotate(0)" }, { transform: "rotate(320deg)" }], { duration: duracao, easing: "ease-in" })
    .onfinish = () => {
      eixoX.remove();
      pularSacola();
    };
}

/** Seções aparecem suavemente ao rolar, e o menu marca a categoria em que você está. */
function ligarAnimacoes() {
  if ("IntersectionObserver" in window && !menosMovimento()) {
    const observador = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) {
          e.target.classList.add("visivel");
          observador.unobserve(e.target);
        }
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    const grupos = [".secao__cabeca", ".cartao", ".info", ".passos li", ".combinados li"];
    for (const el of $$(grupos.join(","), $("main"))) {
      const irmaos = [...el.parentElement.children];
      el.style.setProperty("--atraso", `${Math.min(irmaos.indexOf(el), 4) * 0.08}s`);
      el.classList.add("revelar");
      observador.observe(el);
    }
  }

  if (!("IntersectionObserver" in window)) return;
  const links = $$("[data-secao]");
  const trilho = $(".atalhos__trilho");
  const espiao = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      for (const a of links) a.classList.toggle("ativo", a.dataset.secao === e.target.id);
      const chip = $(`.atalhos [data-secao="${e.target.id}"]`);
      if (chip && trilho) trilho.scrollTo({ left: chip.offsetLeft - 16, behavior: menosMovimento() ? "auto" : "smooth" });
    }
  }, { rootMargin: "-45% 0px -50% 0px" });
  for (const id of new Set(links.map((a) => a.dataset.secao))) {
    const secao = document.getElementById(id);
    if (secao) espiao.observe(secao);
  }
}

// ---------- Eventos ----------

function ligarEventos() {
  document.addEventListener("click", (e) => {
    const alvo = e.target.closest("button, a");
    if (!alvo) return;
    const ds = alvo.dataset;
    if ("abrirCarrinho" in ds) abrirCarrinho();
    else if (ds.montar) abrirMontador({ produto: ds.montar });
    else if (ds.montarKit) abrirMontador({ kitId: ds.montarKit });
    else if (ds.editar) abrirMontador({ editarId: ds.editar });
    else if (ds.remover) carrinho.remover(ds.remover);
    else if (ds.kg) {
      const bolo = cat.bolos[m.modo];
      m.kg = Math.min(bolo.kgMax, Math.max(bolo.kgMin, m.kg + Number(ds.kg) * bolo.passoKg));
      atualizarMontador();
    } else if (ds.empadao) {
      m.qtd = Math.min(cat.empadao.maxPorItem, Math.max(1, m.qtd + Number(ds.empadao)));
      atualizarMontador();
    } else if (ds.divisao) mudarDivisao(ds.divisao, ds.sabor, Number(ds.delta));
    else if (ds.delta && alvo.closest(".qtd[data-produto]")) passoQuantidade(alvo.closest(".qtd").dataset.produto, Number(ds.delta), alvo);
    else if ("enviar" in ds) enviarPedido();
    else if ("fechar" in ds) alvo.closest("dialog").close();
    else if ("irCardapio" in ds) {
      $("#dlg-carrinho").close();
      $("#kits").scrollIntoView({ behavior: "smooth" });
    } else if ("novoPedido" in ds) {
      carrinho.limpar();
      Object.keys(dados).forEach((k) => { dados[k] = ""; });
      tentouEnviar = false;
      $("#dlg-enviado").close();
    }
  });

  // clicar fora do painel fecha
  for (const dlg of $$("dialog")) dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  const formMontar = $("[data-form-montar]");
  formMontar.addEventListener("change", () => { lerMontador(); atualizarMontador(); });
  formMontar.addEventListener("submit", confirmarMontador);

  // quantidade digitada nos salgados
  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-qtd-input]")) mudarQuantidade(e.target.closest(".qtd").dataset.produto, Number(e.target.value) || 0);
  });

  // formulário do pedido: guarda na memória e atualiza o que depende
  const caixa = $("[data-carrinho]");
  const guardar = (e) => {
    const campo = e.target;
    if (!campo.closest("[data-form-pedido]") || !(campo.name in dados)) return;
    if (campo.type === "radio" && !campo.checked) return;
    dados[campo.name] = campo.value;
    if (e.type === "change" || campo.type === "radio") atualizarFormulario();
    else if (tentouEnviar) mostrarErros(r.validarPedido(cat, carrinho.itens(), dados, r.agoraEmRecife()));
  };
  caixa.addEventListener("input", guardar);
  caixa.addEventListener("change", guardar);
}

iniciar();
