const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const outputDir = './help_pages';
const imagesDir = path.join(outputDir, 'images');

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir);

async function downloadImage(url, filepath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  const buffer = await response.buffer();
  fs.writeFileSync(filepath, buffer);
}

async function scrapeHelpPages() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  await page.goto('https://hjalp.unak.is/', { waitUntil: 'networkidle2' });

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => a.href)
      .filter(href => href.includes('hjalp.unak.is'))
      .filter((v, i, a) => a.indexOf(v) === i);
  });

  console.log(`Fann ${links.length} hjálparsíður.`);

  for (const link of links) {
    try {
      await page.goto(link, { waitUntil: 'networkidle2' });

      const data = await page.evaluate(() => {
        const title = document.querySelector('h1')?.innerText || document.title || 'Enginn titill';
        const paragraphs = Array.from(document.querySelectorAll('p, li'))
          .map(el => el.innerText.trim())
          .filter(text => text.length > 0);
        const images = Array.from(document.querySelectorAll('img'))
          .map(img => img.src);
        return { title, paragraphs, images };
      });

      let markdownContent = `# ${data.title}

`;
      data.paragraphs.forEach(p => markdownContent += `${p}

`);

      for (const imgUrl of data.images) {
        try {
          const imgName = path.basename(new URL(imgUrl).pathname);
          const localImgPath = path.join('images', imgName);
          const fullLocalImgPath = path.join(imagesDir, imgName);
          if (!fs.existsSync(fullLocalImgPath)) {
            await downloadImage(imgUrl, fullLocalImgPath);
            console.log(`Sótt mynd: ${imgName}`);
          }
          markdownContent += `![Mynd](${localImgPath})

`;
        } catch (imgError) {
          console.error(`Gat ekki sótt mynd: ${imgUrl}`, imgError);
        }
      }

      const fileName = data.title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') + '.md';
      const filePath = path.join(outputDir, fileName);
      fs.writeFileSync(filePath, markdownContent);
      console.log(`Skrifaði: ${fileName}`);
    } catch (error) {
      console.error(`Villa með ${link}:`, error);
    }
  }

  await browser.close();
  console.log('Búinn að skrapa allar hjálparsíður með myndum!');
}

scrapeHelpPages();