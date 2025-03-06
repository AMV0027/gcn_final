import React, { useState } from "react";

function Image({ src, alt }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = (e) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="cursor-pointer transition-transform hover:scale-105"
      >
        <img src={src} alt={alt} className="w-auto h-full object-cover rounded  hover:shadow-2xl" />
      </button>

      {isExpanded && (
        <div
          className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-30"
          onClick={handleClick}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-[90vh] object-contain"
            />
            <button
              className="absolute top-4 right-4 text-white backdrop-blur-xs hover:text-blue-400 bg-black/50 bg-opacity-50 rounded-full p-2 hover:bg-opacity-75"
              onClick={handleClick}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default Image;
