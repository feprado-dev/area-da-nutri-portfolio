/* Botão "Imprimir ou salvar em PDF" do manual (sem onclick inline, por causa da CSP). */
document.querySelector('[data-imprimir]').addEventListener('click', function () { window.print(); });
