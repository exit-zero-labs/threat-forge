import { chromium, webkit } from '@playwright/test';
const html = `<!doctype html><html><head><style>
body{margin:0;font:16px/1.2 sans-serif}
h1{font-size:36px}
.hidden{display:none}
@media (min-width:640px){.sm\\:inline{display:inline}}
</style></head><body>
<h1 id="h">Threat modeling for people who <br class="hidden sm:inline" /><span id="s">hate threat modeling tools</span></h1>
</body></html>`;
async function probe(browserType, name){
  const b = await browserType.launch();
  for (const w of [375, 640, 1280]) {
    const p = await b.newPage({viewport:{width:w,height:800}});
    await p.setContent(html);
    const res = await p.evaluate(() => {
      const h = document.getElementById('h');
      const s = document.getElementById('s');
      const range = document.createRange();
      const textNode = h.firstChild;
      range.selectNodeContents(textNode);
      const textRects = [...range.getClientRects()];
      const spanTop = s.getBoundingClientRect().top;
      const brDisplay = getComputedStyle(h.querySelector('br')).display;
      // measure rendered gap between end of text and start of span when on same line
      const lastText = textRects[textRects.length-1];
      return {
        brDisplay,
        h1Height: Math.round(h.getBoundingClientRect().height),
        textLines: textRects.length,
        sameLine: Math.abs(lastText.top - spanTop) < 1,
        gap: +(s.getBoundingClientRect().left - lastText.right).toFixed(2),
        textContent: JSON.stringify(h.textContent),
      };
    });
    console.log(name, 'width', w, res);
    await p.close();
  }
  await b.close();
}
await probe(chromium,'chromium');
await probe(webkit,'webkit');
