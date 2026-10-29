/* =========================================================
   DADOS DO SITE — troque aqui (null = ainda não informado)
   ========================================================= */
window.SITE = {
  // true: mostra a faixa de prévia e os selos "a confirmar" nos dados que faltam.
  // false (para publicar): esconde o que estiver null.
  rascunho: false,

  // true: modo demonstração (portfólio). O formulário só grava o recado na Área da nutri
  // (neste navegador) e não abre WhatsApp nem Instagram.
  demo: true,

  // Nutricionista FICTÍCIA (projeto de portfólio).
  nome: "Júlia Monteiro de Castro",
  instagram: null,   // usuário sem @. Ex.: "perfil.da.nutri"

  // Só números, com 55 + DDD. Ex.: "5511999999999".
  // Enquanto for null, os botões levam ao formulário e a mensagem vai pelo Direct do Instagram.
  whatsapp: null,

  // Registro profissional, como deve aparecer. Ex.: "CRN-3 12345".
  crn: null,

  // Cidade do consultório. Ex.: "Campinas – SP".
  cidade: null,

  // Modalidades de atendimento. Ex.: ["Online", "Presencial"].
  // Com duas ou mais, o formulário pergunta qual a pessoa prefere.
  atendimento: null,

  // Consultórios para atendimento presencial (aparecem com mapa em "Onde atendo").
  // Ex.: [{ nome: "Clínica Exemplo", endereco: "Rua Exemplo, 100 – Centro, Campinas – SP" }]
  locais: null,

  // Área da nutri (painel.html). Valores de EXEMPLO: ajustar com a nutricionista.
  painel: {
    assistente: "Flora",                 // nome da assistente da área
    agenda: {
      dias: [1, 2, 3, 4, 5],              // 0 = domingo … 6 = sábado
      inicio: "08:00",
      fim: "18:00",
      pausa: ["12:00", "13:30"],          // almoço (sem consultas)
      passo: 30,                           // de quanto em quanto minutos começam os horários
      duracoes: { "Primeira consulta": 60, "Retorno": 30 } // minutos
    },
    retornoDias: 30                        // sugestão de retorno depois de uma consulta
  },

  // Mensagem que abre no WhatsApp pelos botões "Agendar consulta".
  mensagemPadrao: "Olá, Júlia! Vim pelo site e quero agendar uma consulta."
};
