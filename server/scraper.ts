import puppeteer from "puppeteer";

export async function scrapeInet() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Gå till sidan och vänta på att den laddas klart
  await page.goto("https://www.inet.se/kategori/756/spel", {
    waitUntil: "networkidle2",
  });

  const products = await page.evaluate(() => {
    // Välj alla produkter
    const items = Array.from(
      document.querySelectorAll('li[data-test-id^="search_product_"]')
    );

    const first20Items = items.slice(0, 20);

    return first20Items.map((item) => {
      // Produktnamn
      const name = item.querySelector("h3")?.textContent?.trim() || "Ej hittat";

      // Pris
      const priceElement = item.querySelector(
        "span[data-test-is-discounted-price]"
      )?.textContent;
      const price = priceElement
        ? parseFloat(priceElement.replace(/[^\d]/g, ""))
        : 0;

      // Beskrivning
      const description =
        item.querySelector("p.pjvw5xb")?.textContent?.trim() || "Ej hittat";

      // Lagerstatus
      const stockText = item
        .querySelector("div.s1g68ibl span")
        ?.textContent?.trim();
      const stock = stockText ? parseInt(stockText.replace(/[^\d]/g, "")) : 0;

      const productUrl = item.querySelector("a")?.href || "Ej hittat";
      const imageUrl = item.querySelector("img")?.src || "Ej hittat";

      return { name, price, description, stock, productUrl, imageUrl };
    });
  });

  console.log("Skrapning klar. Hittade", products);
  console.log("Antal Spel", products.length);
  await browser.close();

  return products;
}

scrapeInet();
