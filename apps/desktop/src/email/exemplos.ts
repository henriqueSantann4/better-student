/**
 * E-mails de EXEMPLO, todos inventados, para ver a caixa de entrada no modo
 * navegador (`pnpm dev:web`) enquanto a conexão com o Google não existe.
 * Só é importado em desenvolvimento: não entra no instalador.
 */
import type { Email } from "@better-student/shared";

function antes(horas: number): string {
  return new Date(Date.now() - horas * 3_600_000).toISOString();
}

const base = { lido: false, estrela: false } as const;

export function emailsDeExemplo(): Email[] {
  return [
    {
      ...base,
      id: "ex1",
      de: { nome: "Profa. Helena Exemplo", email: "helena.exemplo@exemplo.edu.br" },
      assunto: "Prova de Estrutura de Dados remarcada para quinta",
      trecho: "Pessoal, por causa do recesso a prova foi remarcada para quinta-feira, 19h, na sala de sempre.",
      corpo:
        "Pessoal,\n\nPor causa do recesso, a prova de Estrutura de Dados foi remarcada para quinta-feira, às 19h, na sala de sempre.\n\nO conteúdo continua o mesmo: listas, pilhas e filas. Tragam documento com foto.\n\nAbraços,\nHelena",
      data: antes(2),
      categoria: "principal",
    },
    {
      ...base,
      id: "ex2",
      de: { nome: "Coordenação do Curso", email: "coordenacao@exemplo.edu.br" },
      assunto: "Prazo de trancamento termina sexta",
      trecho: "Lembramos que o prazo para trancamento de matrícula e cancelamento de disciplina termina nesta sexta.",
      corpo:
        "Prezados estudantes,\n\nLembramos que o prazo para trancamento de matrícula e cancelamento de disciplina termina nesta sexta-feira.\n\nOs pedidos devem ser feitos pelo SUAP, em Ensino → Requerimentos.\n\nAtenciosamente,\nCoordenação do Curso",
      data: antes(26),
      estrela: true,
      categoria: "principal",
    },
    {
      ...base,
      id: "ex3",
      de: { nome: "Moodle (não responda)", email: "moodle@exemplo.edu.br" },
      assunto: "Nova tarefa: Lista 4 de Programação Orientada a Objetos",
      trecho: "Uma nova tarefa foi publicada. Entrega até domingo, 23h59.",
      corpo:
        "Uma nova tarefa foi publicada na disciplina Programação Orientada a Objetos.\n\nTarefa: Lista 4 (herança e polimorfismo)\nEntrega: domingo, 23h59\n\nAcesse o Moodle para ver o enunciado.",
      data: antes(30),
      lido: true,
      categoria: "atualizacoes",
    },
    {
      ...base,
      id: "ex4",
      de: { nome: "SUAP (não responda)", email: "nao-responda@exemplo.edu.br" },
      assunto: "Notas lançadas no diário de Matemática Aplicada",
      trecho: "O professor lançou notas no diário de Matemática Aplicada à Informática.",
      corpo: "O professor lançou notas no diário de Matemática Aplicada à Informática.\n\nConsulte seu boletim no SUAP.",
      data: antes(52),
      lido: true,
      categoria: "atualizacoes",
    },
    {
      ...base,
      id: "ex5",
      de: { nome: "Comunicação do Campus", email: "comunicacao@exemplo.edu.br" },
      assunto: "Inscrições abertas: Semana de Ciência e Tecnologia",
      trecho: "Participe das oficinas e palestras. Vagas limitadas, inscrições pelo SUAP.",
      corpo:
        "Estão abertas as inscrições para a Semana de Ciência e Tecnologia!\n\nSerão oficinas, palestras e minicursos durante toda a semana. As vagas são limitadas e as inscrições devem ser feitas pelo SUAP.\n\nParticipe!",
      data: antes(75),
      categoria: "divulgacao",
    },
    {
      ...base,
      id: "ex6",
      de: { nome: "Biblioteca", email: "biblioteca@exemplo.edu.br" },
      assunto: "Seu empréstimo vence em 2 dias",
      trecho: "O livro \"Algoritmos: teoria e prática\" deve ser devolvido ou renovado até quinta.",
      corpo:
        "Olá!\n\nO livro \"Algoritmos: teoria e prática\" deve ser devolvido ou renovado até quinta-feira.\n\nA renovação pode ser feita pelo sistema da biblioteca.\n\nBiblioteca do Campus",
      data: antes(100),
      lido: true,
      categoria: "atualizacoes",
    },
    {
      ...base,
      id: "ex7",
      de: { nome: "Prof. Marcos Exemplo", email: "marcos.exemplo@exemplo.edu.br" },
      assunto: "Material da aula de hoje",
      trecho: "Segue o link para os slides e o código que usamos em aula.",
      corpo: "Boa noite!\n\nOs slides e o código que usamos hoje estão no Moodle, na seção da semana 14.\n\nAté a próxima aula,\nMarcos",
      data: antes(170),
      lido: true,
      categoria: "principal",
    },
    {
      ...base,
      id: "ex8",
      de: { nome: "Extensão", email: "extensao@exemplo.edu.br" },
      assunto: "Edital de bolsas de extensão 2027",
      trecho: "Está publicado o edital de seleção de bolsistas para projetos de extensão.",
      corpo: "Está publicado o edital de seleção de bolsistas para projetos de extensão de 2027.\n\nLeia o edital completo no site do campus.",
      data: antes(240),
      lido: true,
      categoria: "divulgacao",
    },
  ];
}
