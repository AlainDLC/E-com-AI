// src/components/GamingAILanding.jsx
import ChatWidget from "./ChatWidget";

function GamingAILanding() {
  const technologies = [
    "Node.js & TypeScript",
    "Express.js",
    "MongoDB",
    "LangChain",
    "Puppeteer",

    "LangGraph & Checkpoints",
    "Google GenAI",
    "React & TailwindCSS",
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white font-sans flex flex-col">
      <header className="bg-gray-900 bg-opacity-80 py-4 shadow-lg backdrop-blur-md ml-8 flex justify-center items-center gap-10">
        <img src="/DLCT.png" alt="logo" className="w-20 h-20 rounded-full " />
        <p className="flex-1 text-2xl">
          This demonstration uses real-time product data scraped from Inet. Our
          AI agent processes this information to provide up-to-date and accurate
          recommendations.
        </p>
      </header>
      <main className="flex flex-col items-center justify-center text-center flex-1 py-16 px-6">
        <h2 className="text-5xl md:text-6xl font-extrabold mb-6 text-indigo-400 animate-pulse drop-shadow-lg">
          Gaming AI Live Real World Business Solution
        </h2>
        <p className="text-lg md:text-xl mb-10 text-gray-300">
          Watch AI seed the gaming database in real-time
        </p>

        {/* Video Section */}
        <div className="relative w-full max-w-md mx-auto mb-12">
          <video
            src="/path-to-your-video.mp4"
            controls
            autoPlay
            loop
            muted
            className="rounded-xl shadow-2xl border-4 border-indigo-500 w-full"
          />
          <span className="absolute top-2 left-2 px-2 py-1 bg-red-600 text-white font-bold rounded-lg animate-pulse text-sm">
            LIVE
          </span>
        </div>

        {/* Description Section */}
        <section className="bg-gray-800 bg-opacity-60 rounded-xl p-8 mb-12 max-w-4xl">
          <h3 className="text-3xl font-bold text-indigo-400 mb-4">
            How Gaming AI Works
          </h3>
          <p className="text-gray-300 mb-6">
            We scrape game data and use AI to generate complete item records,
            including name, description, price, and images. The data is then
            seeded into the database, so our Gaming AI agent can respond to your
            questions in real-time with accurate recommendations.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-gray-700 p-4 rounded shadow hover:shadow-lg transition">
              <h4 className="text-xl font-semibold mb-2 text-indigo-400">
                Data Scraping
              </h4>
              <p>
                We collect raw data from games and gather all relevant
                information.
              </p>
            </div>
            <div className="bg-gray-700 p-4 rounded shadow hover:shadow-lg transition">
              <h4 className="text-xl font-semibold mb-2 text-indigo-400">
                AI Generation
              </h4>
              <p>
                The AI completes the data with descriptions, prices, and unique
                IDs.
              </p>
            </div>
            <div className="bg-gray-700 p-4 rounded shadow hover:shadow-lg transition">
              <h4 className="text-xl font-semibold mb-2 text-indigo-400">
                Realtime Agent
              </h4>
              <p>
                Our chat agent uses the database to provide answers and
                recommendations instantly.
              </p>
            </div>
          </div>
        </section>

        {/* Technologies Section */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full max-w-5xl">
          {technologies.map((tech, idx) => (
            <div
              key={idx}
              className="bg-gray-800 bg-opacity-60 border border-indigo-500 rounded-xl p-4 shadow-lg hover:scale-105 transition-transform duration-300"
            >
              <h4 className="text-indigo-400 font-bold text-lg">{tech}</h4>
            </div>
          ))}
        </div>
      </main>

      <ChatWidget />

      <footer className="bg-gray-900 py-6 mt-12 border-t border-indigo-500">
        <div className="container mx-auto text-center text-gray-400">
          &copy; {new Date().getFullYear()} DLC T PIXIE SYSTEM. All rights
          reserved.
        </div>
      </footer>
    </div>
  );
}

export default GamingAILanding;
