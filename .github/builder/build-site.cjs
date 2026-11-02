/**
 * بناء الموقع العام (GitHub Pages) من بيانات الجدول.
 * - يقرأ قائمة المأذونين والأحياء من Apps Script (pub_sitemap).
 * - يصنع صفحة مستقلة لكل مأذون ولكل حي، بنفس قوالب Apps Script (Site.html وPrivacy.html)،
 *   مع عنوان ووصف وصورة لمعاينة واتساب وبحث جوجل.
 * - الناتج في مجلد public-site/ (مستودع GitHub المستقل).
 * التشغيل وحده: node tools/build-site.cjs   (ويشغّله أمر النشر npm run publish تلقائياً)
 *
 * البناء التلقائي (المرحلة الثانية): نسخة من هذا الملف ومن القوالب تُحفظ في المستودع العام داخل .github/builder،
 * ويشغّلها GitHub كل 5 دقائق بالخيار --ci، فتُبنى صفحة أي حي جديد بلا أي أمر من الجهاز.
 * القوالب كلها واجهة منشورة أصلاً (لا كود خادم ولا أسرار).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const CI = process.argv.includes('--ci');
const ROOT = path.join(__dirname, '..');
// في GitHub: الملف داخل .github/builder والقوالب بجانبه، والناتج جذر المستودع
const OUT = CI ? path.join(__dirname, '..', '..') : path.join(ROOT, 'public-site');
const TPL = CI ? path.join(__dirname, 'templates') : path.join(ROOT, 'src');
const CACHE = CI ? path.join(os.tmpdir(), 'og-cache') : path.join(ROOT, '.og-cache');
const CHROME = process.env.CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
// الملفات التي يحتاجها البناء التلقائي (واجهة فقط)
const TEMPLATES = ['Site', 'Privacy', 'Message', 'Panel', 'Common', 'Styles', 'Logo', 'Icons'];
const KEEP = ['.git', '.github'];

/* ───── القوالب: نفس ما يفعله Apps Script في page_ (include_ وboot وcolors) ───── */
const tpl = name => fs.readFileSync(path.join(TPL, name + '.html'), 'utf8');
const safeJson = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const color = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(String(v == null ? '' : v).trim()) ? String(v).trim() : d);
const colorCss = c => { c = c || {}; return ':root{--c-green:' + color(c.green, '#10553E') + ';--c-deep:' + color(c.deep, '#0B3B2B') +
  ';--c-sand:' + color(c.sand, '#D1AD8C') + ';--c-paper:' + color(c.paper, '#F8F5F0') + '}'; };
function render(file, data, colors) {
  return tpl(file).replace(/<\?!= include_\('(\w+)'\) \?>/g, (a, n) => tpl(n))
    .replace('<?!= boot ?>', () => safeJson(data)).replace('<?!= colors ?>', () => colorCss(colors));
}

function config() {
  const c = JSON.parse(fs.readFileSync(CI ? path.join(__dirname, 'site.config.json') : path.join(ROOT, 'site.config.json'), 'utf8'));
  const domain = String(c.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  c.domain = domain;
  c.base = domain ? 'https://' + domain + '/' : 'https://' + c.githubUser + '.github.io/';
  c.googleVerify = verifyCode(c.googleVerify);
  return c;
}

/* رمز وسم التحقق من Search Console: يقبل الرمز وحده أو الوسم كاملاً */
function verifyCode(v) {
  v = String(v || '').trim();
  const m = v.match(/content=["']([^"']+)["']/);
  return (m ? m[1] : v).replace(/[^\w-]/g, '');
}

/* طلب لـ Apps Script بنفس طريقة الموقع: POST بنص JSON */
async function api(conf, fn, ...args) {
  const r = await fetch(conf.api, { method: 'POST', body: JSON.stringify({ fn, args }) });
  const j = await r.json();
  if (!j || !j.ok) throw new Error('رد Apps Script: ' + JSON.stringify(j));
  return j;
}

const escA = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const fileOf = p => (p === '' ? 'index' : p) + '.html';
const ogName = p => (p === '' ? 'home' : p.replace(/\//g, '-'));
const intl = p => (/^05\d{8}$/.test(p || '') ? '+966' + p.slice(1) : '');

/* ───── صورة المعاينة (1200×630) ───── */
function ogHtml(m, line1, line2) {
  const logo = (tpl('Logo').match(/url\("(data:image\/png;base64,[^"]+)"\)/) || [])[1] || '';
  const c = m.colors;
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@700&family=IBM+Plex+Sans+Arabic:wght@500;600&display=block" rel="stylesheet">' +
    '<style>*{margin:0;box-sizing:border-box}html,body{width:1200px;height:630px;overflow:hidden}' +
    'body{background:radial-gradient(circle at 18% 30%,' + c.green + ',' + c.deep + ' 70%);color:' + c.paper + ';font-family:"IBM Plex Sans Arabic",sans-serif;display:flex;align-items:center;gap:56px;padding:0 80px}' +
    '.t{flex:1}.city{display:inline-block;border:2px solid ' + c.sand + ';color:' + c.sand + ';border-radius:999px;padding:6px 26px;font-size:30px;font-weight:600}' +
    'h1{font-family:Amiri,serif;font-size:' + (line1.length > 24 ? 66 : 78) + 'px;line-height:1.3;margin:22px 0 14px}' +
    'p{font-size:36px;opacity:.92}.b{margin-top:34px;font-size:30px;color:' + c.sand + '}' +
    '.logo{width:330px;aspect-ratio:646/420;background:' + c.sand + ';-webkit-mask:url("' + logo + '") center/contain no-repeat}</style></head>' +
    '<body><div class="t"><span class="city">' + escA(m.city) + '</span><h1>' + escA(line1) + '</h1><p>' + escA(line2) + '</p>' +
    '<div class="b">احجز موعد العقد بسهولة</div></div><div class="logo"></div></body></html>';
}
/* صورة من صفحة HTML بمتصفح Chrome، محفوظة في .og-cache حسب بصمة المحتوى فلا تُصنع مرتين.
   jpg: صورة المعاينة (تحويل بـ sips في الماك)، png: أيقونة اللوحة */
function shot(html, w, h, rel, opts, ext) {
  const hash = crypto.createHash('sha1').update(html + w + 'x' + h).digest('hex').slice(0, 12);
  const dest = path.join(opts.out || OUT, rel + '.' + ext);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const cached = path.join(CACHE, hash + '.' + ext);
  // الصورة نفسها من البناء السابق (في GitHub لا توجد ذاكرة .og-cache)
  const prev = opts.prev && opts.prev.map[rel] === hash && path.join(opts.prev.dir, rel + '.' + ext);
  if (!fs.existsSync(cached) && prev && fs.existsSync(prev)) { fs.mkdirSync(CACHE, { recursive: true }); fs.copyFileSync(prev, cached); }
  if (opts.assets) opts.assets[rel] = hash;
  if (!fs.existsSync(cached) && !opts.noImages) {
    fs.mkdirSync(CACHE, { recursive: true });
    const src = path.join(CACHE, hash + '.html'), png = path.join(CACHE, hash + '.shot.png');
    fs.writeFileSync(src, html);
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=' + w + ',' + h,
      '--virtual-time-budget=8000', '--screenshot=' + png, 'file://' + src], { stdio: 'ignore', timeout: 60000 });
    if (ext === 'jpg') toJpg(png, cached);
    else fs.copyFileSync(png, cached);
    fs.unlinkSync(src); fs.unlinkSync(png);
  }
  if (fs.existsSync(cached)) fs.copyFileSync(cached, dest);
  return rel + '.' + ext + '?v=' + hash.slice(0, 8);
}
/* PNG ← JPEG: sips في الماك، وImageMagick في GitHub (يُثبَّت عند أول حاجة فقط) */
function toJpg(png, jpg) {
  const has = c => { try { execFileSync('sh', ['-c', 'command -v ' + c], { stdio: 'ignore' }); return true; } catch (e) { return false; } };
  if (has('sips')) return execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', png, '--out', jpg], { stdio: 'ignore' });
  if (!has('convert') && !has('magick')) execFileSync('sh', ['-c', 'sudo apt-get install -y -qq imagemagick'], { stdio: 'ignore', timeout: 240000 });
  execFileSync(has('magick') ? 'magick' : 'convert', [png, '-quality', '82', jpg], { stdio: 'ignore' });
}
function ogImage(html, name, opts) { return shot(html, 1200, 630, 'og/' + name, opts, 'jpg'); }

/* ───── لوحة التحكم /panel: صفحة بلا أي بيانات، وكل شيء يأتي من الخلفية بعد الدخول ───── */
const PANEL_GREEN = '#0B3B2B', PANEL_SAND = '#D1AD8C', PANEL_PAPER = '#F8F5F0';
function iconHtml(size) {
  const logo = (tpl('Logo').match(/url\("(data:image\/png;base64,[^"]+)"\)/) || [])[1] || '';
  return '<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}html,body{width:' + size + 'px;height:' + size + 'px;overflow:hidden}' +
    'body{background:radial-gradient(circle at 30% 25%,#10553E,' + PANEL_GREEN + ' 75%);display:flex;align-items:center;justify-content:center}' +
    '.l{width:72%;aspect-ratio:646/420;background:' + PANEL_SAND + ';-webkit-mask:url("' + logo + '") center/contain no-repeat}</style></head><body><div class="l"></div></body></html>';
}
function panelHead(conf, icons) {
  const api = new URL(conf.api).origin;
  return '\n<title>لوحة التحكم</title>' +
    '\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '\n<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">' +
    // لا يتصل إلا بخلفية Apps Script وخطوط جوجل
    '\n<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src \'self\' data: https:; connect-src \'self\' ' + api + ' https://script.googleusercontent.com; base-uri \'none\'; form-action \'none\'">' +
    '\n<link rel="manifest" href="' + escA(conf.base + 'panel.webmanifest') + '">' +
    '\n<link rel="icon" type="image/png" sizes="192x192" href="' + escA(conf.base + icons[192]) + '">' +
    '\n<link rel="apple-touch-icon" sizes="180x180" href="' + escA(conf.base + icons[180]) + '">' +
    '\n<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">' +
    '\n<meta name="apple-mobile-web-app-title" content="لوحة الحجز"><meta name="apple-mobile-web-app-status-bar-style" content="default">' +
    '\n<meta name="theme-color" content="' + PANEL_GREEN + '">' +
    '\n<script>window.API = ' + json(conf.api) + ';</script>';
}
function buildPanel(conf, opts, render, write) {
  const icons = {};
  [180, 192, 512].forEach(n => { icons[n] = shot(iconHtml(n), n, n, 'icons/panel-' + n, opts, 'png'); });
  write('panel.webmanifest', JSON.stringify({
    name: 'لوحة تحكم منصة الحجز', short_name: 'لوحة الحجز', lang: 'ar', dir: 'rtl',
    start_url: conf.base + 'panel', scope: conf.base + 'panel', display: 'standalone',
    background_color: PANEL_PAPER, theme_color: PANEL_GREEN,
    icons: [192, 512].map(n => ({ src: conf.base + icons[n], sizes: n + 'x' + n, type: 'image/png', purpose: 'any' }))
  }, null, 1));
  // بلا بيانات: لا ألوان مأذون ولا أسماء ولا روابط، فقط رابط الخلفية العام
  write('panel.html', inject(render('Panel', {}, null), panelHead(conf, icons)));
}

/* ───── رأس الصفحة: العنوان والوصف والمعاينة وبيانات جوجل ───── */
function head(o) {
  return '\n<title>' + escA(o.title) + '</title>' +
    '\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '\n<meta name="description" content="' + escA(o.desc) + '">' +
    '\n<link rel="canonical" href="' + escA(o.url) + '">' +
    (o.verify ? '\n<meta name="google-site-verification" content="' + escA(o.verify) + '">' : '') +
    '\n<meta property="og:type" content="website"><meta property="og:locale" content="ar_SA">' +
    '\n<meta property="og:site_name" content="' + escA(o.siteName) + '">' +
    '\n<meta property="og:title" content="' + escA(o.title) + '">' +
    '\n<meta property="og:description" content="' + escA(o.desc) + '">' +
    '\n<meta property="og:url" content="' + escA(o.url) + '">' +
    (o.image ? '\n<meta property="og:image" content="' + escA(o.image) + '"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' +
      '\n<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="' + escA(o.image) + '">' : '') +
    '\n<meta name="theme-color" content="' + escA(o.color) + '">' +
    (o.ld ? '\n<script type="application/ld+json">' + json(o.ld) + '</script>' : '') +
    (o.api ? '\n<script>window.API = ' + json(o.api) + ';</script>' : '');
}
function inject(html, extra) {
  if (!html.includes('<meta charset="utf-8">')) throw new Error('قالب بلا meta charset');
  if (/<\?/.test(html)) throw new Error('رموز قوالب متبقية');
  return html.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + extra);
}

/* ───── البناء ───── */
function build(sitemap, conf, opts) {
  opts = opts || {};
  const OUT_ = opts.out || OUT;
  // صور البناء السابق: تُنقل جانباً ثم تُستعمل إذا لم يتغير محتواها
  opts = Object.assign({}, opts, { assets: {}, prev: keepPrev(OUT_) });
  // الناتج يُبنى من جديد كل مرة (ما عدا .git و.github)، فالحي الموقوف تختفي صفحته
  fs.mkdirSync(OUT_, { recursive: true });
  fs.readdirSync(OUT_).filter(f => KEEP.indexOf(f) < 0).forEach(f => fs.rmSync(path.join(OUT_, f), { recursive: true, force: true }));
  const pages = [];
  const write = (rel, html) => { const f = path.join(OUT_, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };

  sitemap.sites.forEach(s => {
    const D = s.data, m = D.m, url = p => conf.base + p;
    const links = { privacy: url(s.privacyPath), panel: sitemap.panel };
    const lic = m.license ? ' مأذون مرخّص برقم ' + m.license + '.' : '';
    const business = (u, area, img) => ({
      '@context': 'https://schema.org', '@type': 'ProfessionalService', name: m.shortName + ' – ' + m.title, url: u, image: img,
      telephone: intl(m.phone) || undefined, areaServed: { '@type': 'Place', name: area },
      address: { '@type': 'PostalAddress', addressLocality: m.city, addressCountry: 'SA' }
    });
    const page = (p, boot, title, desc, ogLine1, area) => {
      const img = conf.base + ogImage(ogHtml(m, ogLine1, m.shortName + ' · ' + m.title), ogName(p), opts);
      const html = render('Site', Object.assign({}, D, boot, { avail: null, base: conf.api, links: Object.assign({ self: url(p) }, links) }), m.colors);
      const full = inject(html, head({ title, desc, url: url(p), image: img, siteName: m.shortName + ' – ' + m.title, color: m.colors.deep,
        ld: business(url(p), area, img), api: conf.api, verify: p === '' ? conf.googleVerify : '' }));
      write(fileOf(p), full);
      // صفحة لها صفحات تحتها (مثل /jeddah و/jeddah/rawdah): نسخة index أيضاً حتى يفتحها GitHub بالشكلين
      if (p && (s.districts.some(d => d.path.startsWith(p + '/')) || s.privacyPath.startsWith(p + '/'))) write(p + '/index.html', full);
      pages.push({ path: p, title });
    };

    // الصفحة الرئيسية للمأذون
    // صفحة المدينة الرئيسية (مثل /jeddah) عنوانها باسم المدينة
    const ch = s.cityHome;
    page(s.path, { district: null, districts: [], cityHome: ch },
      ch ? 'مأذون أنكحة في ' + ch + ' – ' + m.shortName : m.shortName + ' | ' + m.title + ' في ' + m.city,
      m.shortName + '، ' + m.title + ' في ' + m.city + (m.tagline ? ' – ' + m.tagline : '') + '. احجز موعد عقد النكاح بسهولة: اختر اليوم والموعد بعد الصلاة.' + lic,
      ch ? 'مأذون أنكحة في ' + ch : m.title + ' في ' + m.city, m.city);
    // رمز رابط المأذون يحوّل إلى صفحته (الصفحة الأولى أو صفحة مدينته)
    if (s.slug && s.path !== s.slug.toLowerCase()) write(s.slug.toLowerCase() + '.html', '<!doctype html><meta charset="utf-8"><title>' + escA(m.shortName) + '</title><link rel="canonical" href="' + escA(url(s.path)) +
      '"><meta http-equiv="refresh" content="0;url=' + escA(url(s.path)) + '"><a href="' + escA(url(s.path)) + '">' + escA(m.shortName) + '</a>');

    // صفحة لكل حي
    s.districts.forEach(d => {
      const dist = { id: d.id, name: d.name, slug: d.slug, city: d.city };
      const title = 'مأذون أنكحة في حي ' + d.name + ' – ' + d.city;
      page(d.path, { district: dist, districts: [dist] }, title, d.desc ||
        'احجز موعد عقد النكاح في حي ' + d.name + ' بـ' + d.city + ' مع ' + m.shortName + '، ' + m.title + '. اختر اليوم والموعد بعد الصلاة من التقويم الهجري بسهولة.' + lic,
        'مأذون أنكحة في حي ' + d.name, 'حي ' + d.name + '، ' + d.city);
    });

    // سياسة الخصوصية
    const pv = Object.assign({ m: m, base: conf.api, home: url(s.path) }, sitemap.privacy);
    write(fileOf(s.privacyPath), inject(render('Privacy', pv, m.colors), head({
      title: 'سياسة الخصوصية — ' + sitemap.privacy.platformName, desc: 'سياسة الخصوصية لموقع حجز ' + m.shortName + '.', url: url(s.privacyPath),
      siteName: m.shortName, color: m.colors.deep })));
    pages.push({ path: s.privacyPath, title: 'privacy' });
  });

  buildPanel(conf, opts, render, write);
  pages.push({ path: 'panel', title: 'لوحة التحكم', noindex: true });

  // صفحة «غير موجودة» وملفات جوجل
  write('404.html', inject(render('Message', { title: 'الصفحة غير موجودة', text: 'تأكد من الرابط، أو افتح الصفحة الرئيسية: ' + conf.base }), head({
    title: 'الصفحة غير موجودة', desc: '', url: conf.base, siteName: '', color: '#0B3B2B' }).replace('<link rel="canonical"', '<meta name="robots" content="noindex"><link rel="canonical"')));
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pages.filter(p => !p.noindex).map(p => '  <url><loc>' + escA(conf.base + p.path) + '</loc><lastmod>' + today + '</lastmod></url>').join('\n') + '\n</urlset>\n');
  write('robots.txt', 'User-agent: *\nAllow: /\nDisallow: /panel\nSitemap: ' + conf.base + 'sitemap.xml\n');
  write('.nojekyll', '');
  if (conf.domain) write('CNAME', conf.domain + '\n');
  write('assets.json', JSON.stringify(opts.assets, Object.keys(opts.assets).sort(), 1) + '\n');
  if (opts.prev) fs.rmSync(opts.prev.dir, { recursive: true, force: true });
  // البناء التلقائي في GitHub: نسخة من البناء والقوالب (على الجهاز فقط، فـ GitHub لا يعدّل ملفات .github)
  if (!CI && !opts.noBuilder) writeBuilder(OUT_, conf);
  return pages;
}

/* ينقل صور og وicons من البناء السابق إلى مجلد مؤقت مع بصماتها (assets.json) */
function keepPrev(out) {
  let map = {};
  try { map = JSON.parse(fs.readFileSync(path.join(out, 'assets.json'), 'utf8')); } catch (e) { return null; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prev-assets-'));
  ['og', 'icons'].forEach(d => { if (fs.existsSync(path.join(out, d))) fs.cpSync(path.join(out, d), path.join(dir, d), { recursive: true }); });
  return { map: map, dir: dir };
}

/* .github/builder: هذا الملف والقوالب وإعداد الموقع، و.github/workflows/build.yml يشغّله كل 5 دقائق */
function writeBuilder(out, conf) {
  const dir = path.join(out, '.github', 'builder');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'templates'), { recursive: true });
  fs.copyFileSync(__filename, path.join(dir, 'build-site.cjs'));
  TEMPLATES.forEach(n => fs.copyFileSync(path.join(TPL, n + '.html'), path.join(dir, 'templates', n + '.html')));
  fs.writeFileSync(path.join(dir, 'site.config.json'), JSON.stringify({ domain: conf.domain, githubUser: conf.githubUser, repo: conf.repo, api: conf.api, googleVerify: conf.googleVerify || '' }, null, 2) + '\n');
  fs.mkdirSync(path.join(out, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(out, '.github', 'workflows', 'build.yml'), WORKFLOW);
}
const WORKFLOW = `# يبني صفحات الأحياء من الجدول كل 5 دقائق، ويرفعها إذا تغيّر شيء (حي جديد، اسم جديد، مدينة جديدة)
# يُكتب تلقائياً من tools/build-site.cjs في مشروع المنصة، فلا تعدّله هنا
name: build-pages
on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:
permissions:
  contents: write
  pages: write
concurrency:
  group: build-pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1
      - name: build
        run: node .github/builder/build-site.cjs --ci
      - name: push
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          git add -A
          if git diff --cached --quiet; then echo "no changes"; exit 0; fi
          git -c user.name="booking-bot" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit -q -m "auto: update pages"
          for i in 1 2 3; do
            if git push -q origin HEAD:main; then break; fi
            git fetch -q origin main && git reset -q --soft origin/main && git -c user.name="booking-bot" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit -q -m "auto: update pages" || true
          done
          curl -s -o /dev/null -X POST -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/\${{ github.repository }}/pages/builds" || true
`;

async function main() {
  const conf = config();
  console.log('قراءة الأحياء من الجدول…');
  const sitemap = await api(conf, 'pub_sitemap', CI ? 'ci' : '');
  const pages = build(sitemap, conf);
  console.log('✓ بُنيت ' + pages.length + ' صفحة في public-site/ (الرابط الأساسي: ' + conf.base + ')');
  return { conf, sitemap, pages };
}

module.exports = { build, config, api, main, render };
if (require.main === module) main().catch(e => { console.error('\n⛔ ' + (e && e.message || e) + '\n'); process.exit(1); });
