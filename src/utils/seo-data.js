const SITE_URL = "https://www.tedkoomen.com"
const SITE_NAME = "Critical Section"
const absoluteUrl = path => {
  const url = new URL(path, SITE_URL)
  if (!url.pathname.endsWith("/") && !url.pathname.split("/").pop().includes(".")) url.pathname += "/"
  return url.href
}
const author = {
  "@type": "Person",
  "@id": absoluteUrl("/about-me/#person"),
  name: "Ted Koomen",
  url: absoluteUrl("/about-me/"),
  sameAs: ["https://github.com/tedkoomen", "https://www.linkedin.com/in/tedkoomen/"],
}

function structuredData({ title, description, pathname, image, article, datePublished }) {
  const url = absoluteUrl(pathname)
  const page = {
    "@type": article ? "BlogPosting" : pathname === "/about-me/" ? "ProfilePage" : "WebPage",
    "@id": `${url}#${article ? "article" : "webpage"}`,
    url,
    name: title,
    description,
    inLanguage: "en",
    isPartOf: { "@id": absoluteUrl("/#website") },
    ...(article ? {
      headline: title,
      image: [image],
      author: { "@id": author["@id"] },
      mainEntityOfPage: url,
      ...(datePublished ? { datePublished: new Date(datePublished).toISOString() } : {}),
    } : pathname === "/about-me/" ? { mainEntity: { "@id": author["@id"] } } : {}),
  }
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": absoluteUrl("/#website"), url: absoluteUrl("/"), name: SITE_NAME, publisher: { "@id": author["@id"] } },
      author,
      page,
    ],
  }
}

const escapeXml = value => value.replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char]))
function sitemapXml(postPaths) {
  const urls = [...new Set(["/", "/blog/", "/about-me/", "/resume/", ...postPaths])]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(path => `  <url><loc>${escapeXml(absoluteUrl(path))}</loc></url>`).join("\n")}\n</urlset>\n`
}
module.exports = { SITE_URL, SITE_NAME, absoluteUrl, structuredData, sitemapXml }
