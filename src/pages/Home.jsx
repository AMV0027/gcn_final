import React, { useState, useRef, useEffect } from "react";
import { FaPaperPlane, FaSpinner, FaBook, FaFileAlt, FaTrash, FaCopy } from "react-icons/fa";
import { RiChatNewLine } from "react-icons/ri";
import StyledMarkdown from "../components/StyledMarkdown";
import logo from "../assets/wlogo.png";
import Image from "../components/Image";
import { FaPlus } from "react-icons/fa6";
import { BsGlobe2 } from "react-icons/bs";
import { HiSpeakerphone } from "react-icons/hi";
import SpeechToText from '../components/SpeechToText';
import TextToSpeech from "../components/TextToSpeech";

const Home = () => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [recentQueries, setRecentQueries] = useState([]);
  const [showVideos, setShowVideos] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [chatList, setChatList] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const inputRef = useRef(null);
  const [chatTab, setChatTab] = useState(false);
  const [url, setUrl] = useState('');
  const [metadata, setMetadata] = useState({});
  const [text, setText] = useState('');

  const handleFetch = async () => {
    const data = await fetchMetadata(url);
    setMetadata(data);
  };

  useEffect(() => {
    const savedQueries = JSON.parse(localStorage.getItem("recentQueries") || "[]");
    setRecentQueries(savedQueries);
    fetchChatList();
  }, []);

  useEffect(() => {
    chatMessages.forEach((msg) => {
      msg.online_links.forEach((link) => {
        if (!metadata[link]) {
          fetchMetadata(link);
        }
      });
    });
  }, [chatMessages]);

  const fetchChatList = async () => {
    try {
      const response = await fetch("http://localhost:5000/api/chat-list");
      if (!response.ok) throw new Error("Failed to fetch chat list");
      const data = await response.json();
      setChatList(data);
    } catch (error) {
      console.error("Error fetching chat list:", error);
    }
  };

  const deleteChat = async (chatId) => {
    try {
      const response = await fetch(
        `http://localhost:5000/api/chat?chatId=${encodeURIComponent(chatId)}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to delete chat");
      await fetchChatList();
      if (selectedChat && selectedChat.chat_id === chatId) {
        setSelectedChat(null);
        setChatMessages([]);
        setResults(null);
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const currentChatId = selectedChat ? selectedChat.chat_id : `chat_${Date.now()}`;

    const updatedRecentQueries = [query, ...recentQueries.filter((q) => q !== query)].slice(0, 5);
    setRecentQueries(updatedRecentQueries);
    localStorage.setItem("recentQueries", JSON.stringify(updatedRecentQueries));

    setLoading(true);
    try {
      const response = await fetch("http://localhost:5000/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, chatId: currentChatId }),
      });
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();

      await fetchChatList();

      const newMessage = {
        chat_id: currentChatId,
        query: data.query,
        answer: data.answer,
        pdf_references: data.pdf_references,
        similar_images: data.similar_images,
        online_images: data.online_images,
        online_links: data.online_links, // Ensure online_links is included
        created_at: new Date().toISOString(),
      };

      if (selectedChat) {
        const updatedMessages = [...chatMessages, newMessage];
        setChatMessages(updatedMessages);
        setResults(newMessage);
      } else {
        setSelectedChat(newMessage);
        setChatMessages([newMessage]);
        setResults(newMessage);
      }
    } catch (error) {
      console.error("Query failed", error);
      setResults(null);
    } finally {
      setLoading(false);
      setQuery("");
    }
  };

  const selectChat = async (chat) => {
    setSelectedChat(chat);
    setResults({
      query: chat.query,
      answer: chat.answer,
      pdf_references: chat.pdf_references,
      similar_images: chat.similar_images,
      online_images: chat.online_images,
    });
    await fetchChatHistory(chat.chat_id);
  };

  const fetchChatHistory = async (chatId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/chat-history/${chatId}`);
      if (!response.ok) throw new Error("Failed to fetch chat history");
      const messages = await response.json();
      setChatMessages(messages);
      if (messages.length > 0) {
        setResults(messages[messages.length - 1]);
      }
    } catch (error) {
      console.error("Error fetching chat history:", error);
    }
  };

  const fetchMetadata = async (url) => {
    try {
      const response = await fetch(
        `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
      );
      const text = await response.json();
      const doc = new DOMParser().parseFromString(text.contents, "text/html");
      const title = doc.querySelector("title")?.innerText || "Unknown";
      const icon =
        doc.querySelector("link[rel='icon']")?.href ||
        `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}`;

      setMetadata((prevMetadata) => ({
        ...prevMetadata,
        [url]: { title, icon },
      }));
    } catch (error) {
      console.error("Error fetching metadata for", url, error);
      setMetadata((prevMetadata) => ({
        ...prevMetadata,
        [url]: { title: "Unknown", icon: "" },
      }));
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      console.log("Text copied to clipboard!");
    }).catch((err) => {
      console.error("Failed to copy text: ", err);
    });
  };

  const handleTranscriptChange = (newTranscript) => {
    setQuery(newTranscript);
    inputRef.current.value = newTranscript;
  };


  return (
    <div className="h-screen overflow-hidden pt-12 bg-zinc-900 text-white">
      <a href="/home">
        <header className="fixed z-10 backdrop-blur-lg w-screen top-0 right-0 px-6 py-1 border-b border-gray-800 flex items-center justify-between">
          <div className="flex flex-row gap-1 items-center select-none">
            <img src={logo || "/placeholder.svg"} className="h-12 select-none" alt="GCN Logo" />
            <p className="text-xl font-bold font-unbound">GCN</p>
          </div>
          <div className="flex items-center space-x-4">
            <button className="text-gray-400 hover:text-white">
              <FaBook size={20} />
            </button>
            <button className="text-gray-400 hover:text-white">
              <FaFileAlt size={20} />
            </button>
          </div>
        </header>
      </a>
      <button
        onClick={() => setChatTab(!chatTab)}
        className="flex items-center gap-2 ml-2 bg-zinc-700 hover:bg-zinc-800 p-2 absolute z-30 rounded translate-x-2 translate-y-6"
      >
        <RiChatNewLine />
      </button>
      <div className="flex flex-row">
        <aside
          className={`${chatTab ? "w-[800px] md:w-[300px] opacity-100 translate-x-0" : "w-0 opacity-0 translate-x-[-100%]"} bg-zinc-800 border-r border-blue-400 text-white transition-all duration-700 ease-in-out overflow-hidden`}
        >
          <div className="h-[calc(100vh-48px)] pt-18 p-4 overflow-y-auto flex flex-col gap-2">
            {chatList.map((chat) => (
              <div
                key={chat.chat_id}
                className={`flex justify-between w-full text-left bg-zinc-800 border-1 border-l-6 border-zinc-500 p-2 rounded ${selectedChat?.chat_id === chat.chat_id ? "bg-zinc-700" : "hover:bg-zinc-700"} transition-all ease-in-out duration-75`}
              >
                <button
                  className="w-full text-left h-full hover:cursor-pointer"
                  onClick={() => selectChat(chat)}
                >
                  {chat.query.substring(0, 40)}...
                </button>
                <button
                  className="ml-2 text-zinc-600 hover:text-blue-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(chat.chat_id);
                  }}
                >
                  <FaTrash />
                </button>
              </div>
            ))}
          </div>
        </aside>
        <main className="flex-grow pb-6 py-5 flex flex-col items-center">
          <div className="w-full max-w-6xl mb-8 rounded-lg shadow-lg">
            <div className="p-4">
              <div className="h-[75vh] overflow-y-auto">
                {chatMessages.length === 0 ? (
                  <div className="flex flex-col justify-center items-center h-full font-poppins">
                    <div className="flex flex-row gap-1 items-center select-none">
                      <img src={logo || "/placeholder.svg"} className="h-36 select-none" alt="GCN Logo" />
                      <p className="text-7xl font-semibold font-unbound">GCN</p>
                    </div>
                    <p className="relative -top-5 text-xl">Global Compliance Navigator</p>
                    <h2 className="text-4xl font-thin text-gray-400 text-center">
                      What do you want to know about compliance?
                    </h2>
                  </div>
                ) : (
                  <div>
                    {chatMessages.map((msg, index) => (
                      <div key={index} className="flex w-full font-raleway flex-row justify-between mb-4 border-b-2 border-zinc-800 pb-8">
                        <div className="h-full w-7xl full">
                          <h1 className="text-3xl font-normal mb-4 mt-4 font-poppins">{msg.query}</h1>
                          <div className="mb-1 rounded-t-2xl text-xl mt-2 flex justify-start items-center gap-2"><p className="text-blue-400 text-md animate-pulse"><BsGlobe2 /></p>Answer</div>
                          <div className="w-full mt-2 mb-1 overflow-y-auto flex flex-row justify-start gap-2 rounded-lg">
                            {msg.online_links.map((link, index) => {
                              const meta = metadata[link] || { title: "Loading...", icon: "" };
                              const truncatedTitle = meta.title.length > 10 ? `${meta.title.slice(0, 15)}...` : meta.title;

                              return (
                                <a
                                  key={index}
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center space-x-3 bg-zinc-700 text-zinc-200 px-5 py-3 rounded-lg hover:bg-zinc-600 transition-transform transform hover:scale-105 shadow-md hover:shadow-lg"
                                >
                                  {meta.icon && (
                                    <img src={meta.icon} alt="icon" className="w-6 h-6 rounded-full" />
                                  )}
                                  <span className="truncate max-w-xs text-xs">{truncatedTitle}</span>
                                </a>
                              );
                            })}
                          </div>

                          <StyledMarkdown content={msg.answer} />
                          <div className="flex flex-row justify-end gap-2 items-center">
                            <TextToSpeech text={msg.answer} />
                            <button
                              onClick={() => copyToClipboard(msg.answer)}
                              className=" text-gray-400 hover:text-white"
                            >
                              <FaCopy />
                            </button>
                          </div>
                          {msg?.pdf_references && msg.pdf_references.length > 0 && (
                            <>
                              <div className="mb-1 rounded-t-2xl text-md mt-2 flex justify-start items-center gap-2"><p className="text-blue-400 text-md animate-pulse"><BsGlobe2 /></p>PDF Links</div>
                              <table className="w-full border-collapse rounded-lg overflow-hidden shadow-md">
                                <thead className="bg-zinc-700">
                                  <tr>
                                    <th className="p-4 text-sm font-thin text-white">PDF Name</th>
                                    <th className="p-4 text-sm font-thin text-white">Page Numbers</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-zinc-800">
                                  {msg.pdf_references.map((ref, i) => (
                                    <tr key={i} className="border-t border-zinc-600">
                                      <td className="p-4 text-white">{ref.pdf_name}</td>
                                      <td className="p-4 text-white">
                                        {ref.page_numbers.map((page, idx) => (
                                          <span key={idx}>
                                            <a
                                              href={`http://localhost:5000/api/pdf?name=${encodeURIComponent(ref.pdf_name)}#page=${page}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-white hover:text-blue-500 underline"
                                            >
                                              {page}
                                            </a>
                                            {idx !== ref.page_numbers.length - 1 && ", "}
                                          </span>
                                        ))}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          )}
                        </div>
                        <div className="w-1/4 p-3 gap-2 flex flex-col justify-start">
                          <button
                            onClick={() => setShowImages(!showImages)}
                            className="border-2 text-xs md:text-md flex items-center justify-center gap-2 hover:text-blue-400 hover:border-blue-400 border-zinc-600 text-poppins rounded-md p-2">
                            Search Images <FaPlus />
                          </button>
                          <div>
                            {showImages && ((msg?.similar_images && msg.similar_images.length > 0) ||
                              (msg?.online_images && msg.online_images.length > 0)) && (
                                <div className={`grid grid-cols-2 gap-2 ${showImages ? " opacity-100" : "opacity-0"} transition-all duration-1000 ease-in-out`}>
                                  {msg?.similar_images && msg.similar_images.map((imgObj, index) => (
                                    <Image
                                      src={`data:image/png;base64,${imgObj.image_base64}`}
                                      key={index}
                                      alt={`Similar image ${index + 1}`}
                                    />
                                  ))}
                                  {msg?.online_images && msg.online_images.map((imgUrl, index) => (
                                    <Image
                                      src={imgUrl}
                                      key={index}
                                      alt={`Online image ${index + 1}`}
                                    />
                                  ))}
                                </div>
                              )}
                          </div>

                          <button
                            onClick={() => setShowVideos(!showVideos)}
                            className="border-2 text-xs md:text-md flex items-center justify-center gap-2 hover:text-blue-400 hover:border-blue-400 border-zinc-600 text-poppins rounded-md p-2">
                            Search Videos <FaPlus />
                          </button>

                          <div className="flex flex-col gap-2">
                            {showVideos && msg.online_videos.map((link, index) => (
                              <iframe
                                src={`https://www.youtube-nocookie.com/embed/${link}?modestbranding=1&rel=0&showinfo=0&controls=1`}
                                title={`YouTube video player ${index}`}
                                className={`rounded-md w-full aspect-video ${showVideos ? "opacity-100" : "opacity-0"} transition-all duration-1000 ease-in-out`}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                key={index}
                                referrerpolicy="strict-origin-when-cross-origin"
                              ></iframe>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <form onSubmit={handleSubmit} className="flex mx-auto border-blue-400 border-2 rounded-full">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="flex-grow p-3 rounded-l-full bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-transparent"
              />
              <SpeechToText onTranscriptChange={handleTranscriptChange} />
              <button
                type="submit"
                disabled={loading}
                className="p-3 bg-zinc-700 hover:invert-100 text-white rounded-r-full disabled:opacity-50"
              >
                {loading ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Home;
