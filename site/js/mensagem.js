// Monta o texto do pedido que vai para o WhatsApp da Doce Maria.
// Função pura: mesmo pedido → mesma mensagem (testada em tests/mensagem.test.mjs).

import {
  fatias, formatarHorario, formatarKg, formatarMoeda, montarHorario, nomeDoBairro, precoAdicionais,
  precoBolo, precoItem, produto, quantidades, totais, valoresPagamento,
} from "./regras.js?v=__VERSAO__";


function linhasBoloDecorado(cat, bolo, kg) {
  const d = cat.bolos.decorado;
  const formato = d.formatos.find((f) => f.id === bolo.formato)?.nome ?? "";
  const linhas = [`   ${formato} | Massa: ${bolo.massa.toLowerCase()} | Recheio${bolo.recheios.length > 1 ? "s" : ""}: ${bolo.recheios.join(", ").toLowerCase()}`];
  for (const id of bolo.adicionais ?? []) {
    const adicional = d.adicionais.find((a) => a.id === id);
    linhas.push(`   + ${adicional.nome}: ${formatarMoeda(precoAdicionais(cat, [id], kg))}`);
  }
  if (bolo.topo) linhas.push(`   + ${d.topo.nome}: a partir de ${formatarMoeda(d.topo.aPartirDe)}, valor a confirmar (mando a foto do tema aqui)`);
  if (bolo.decoracao?.trim()) linhas.push(`   Decoração: ${bolo.decoracao.trim()}`);
  return linhas;
}

function listarQuantidades(cat, objeto) {
  return Object.entries(objeto)
    .filter(([, qtd]) => qtd > 0)
    .map(([id, qtd]) => `${qtd} ${produto(cat, id).plural}`)
    .join(", ");
}

/** Linhas de um item do carrinho. */
export function linhasDoItem(cat, item) {
  if (item.tipo === "kit") {
    const kit = cat.kits.find((k) => k.id === item.kitId);
    return [
      `1x ${kit.nome} (${kit.pessoas} pessoas): ${formatarMoeda(precoItem(cat, { ...item, bolo: { ...item.bolo, adicionais: [] } }))}`,
      `   Bolo decorado ${formatarKg(kit.boloKg)}`,
      ...linhasBoloDecorado(cat, item.bolo, kit.boloKg),
      `   Salgados: ${listarQuantidades(cat, item.salgados)}`,
      `   Doces: ${listarQuantidades(cat, item.doces)}`,
    ];
  }
  if (item.tipo === "bolo") {
    const bolo = cat.bolos[item.produto];
    const base = formatarMoeda(precoBolo(cat, { ...item, adicionais: [] }));
    if (item.produto === "decorado") {
      return [`1x ${bolo.nome} ${formatarKg(item.kg)} (${fatias(cat, "decorado", item.kg)}): ${base}`, ...linhasBoloDecorado(cat, item, item.kg)];
    }
    const sabor = item.sabor ? ` de ${item.sabor.toLowerCase()}` : "";
    return [`1x ${bolo.nome}${sabor} ${formatarKg(item.kg)}: ${base}`];
  }
  if (item.tipo === "empadao") {
    const e = cat.empadao;
    const preco = precoItem(cat, item);
    return [`${item.qtd}x ${e.nome} ${e.tamanho} de ${item.sabor.toLowerCase()}: ${preco === null ? "valor a confirmar" : formatarMoeda(preco)}`];
  }
  const p = produto(cat, item.produto);
  return [`${item.qtd}x ${p.nome}: ${formatarMoeda(precoItem(cat, item))}`];
}

function linhaRecebimento(cat, dados, temBolo) {
  if (dados.modo === "retirada") return `🏠 Retirada: ${cat.loja.endereco}`;
  if (dados.modo === "app") return `🚘 Vou chamar Uber/99 por minha conta (${temBolo ? "carro, porque tem bolo" : "moto ou carro"})`;
  const t = totais(cat, [], dados).taxa;
  const taxa = t === null ? "taxa a confirmar" : `taxa estimada ${formatarMoeda(t)}`;
  return `🚗 Entrega: ${dados.endereco.trim()}, ${nomeDoBairro(dados)} (${taxa})`;
}

/** Texto completo do pedido. */
export function montarMensagem(cat, itens, dados) {
  const q = quantidades(cat, itens);
  const t = totais(cat, itens, dados);
  const linhas = [
    "Olá, Doce Maria! Quero fazer uma encomenda pelo site 🎂",
    `👤 Nome: ${dados.nome.trim()}`,
    `📅 Para: ${formatarHorario(montarHorario(dados.data, Number(dados.hora)))}`,
    linhaRecebimento(cat, dados, q.temBolo),
  ];
  if (dados.modo === "entrega" && dados.referencia?.trim()) linhas.push(`   Referência: ${dados.referencia.trim()}`);
  const ondePaga = dados.modo === "entrega" ? "na entrega" : "na retirada";
  const v = valoresPagamento(cat, t.total, dados.pagamento);
  const semPendentes = t.aConfirmar.length ? " (sem contar o que está a confirmar)" : "";
  linhas.push(dados.pagamento === "sinal"
    ? `💳 Pagamento: sinal de 50% no Pix (${formatarMoeda(v.agora)}) e o restante (${formatarMoeda(v.depois)}) ${ondePaga}${semPendentes}`
    : `💳 Pagamento: 100% no Pix (${formatarMoeda(v.agora)})${semPendentes}`);
  linhas.push("");
  for (const item of itens) linhas.push(...linhasDoItem(cat, item));
  linhas.push("");
  linhas.push(`Subtotal: ${formatarMoeda(t.subtotal)}`);
  if (dados.modo === "entrega") linhas.push(`Entrega: ${t.taxa === null ? "a confirmar" : `${formatarMoeda(t.taxa)} (estimada)`}`);
  linhas.push(`Total: ${formatarMoeda(t.total)}${t.aConfirmar.length ? ` + ${t.aConfirmar.join(" + ")} (a confirmar)` : ""}`);
  if (dados.observacoes?.trim()) linhas.push(`📝 Observações: ${dados.observacoes.trim()}`);
  linhas.push("");
  linhas.push(
    dados.pagamento === "sinal"
      ? "Aguardo a confirmação da data e a chave Pix para o sinal."
      : "Aguardo a confirmação da data e a chave Pix para o pagamento.",
  );
  return linhas.join("\n");
}

/** Link que abre a conversa com a mensagem já escrita (Android, iPhone e computador). */
export function linkWhatsApp(numero, texto) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
