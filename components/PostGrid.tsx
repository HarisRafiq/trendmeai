import React from "react";
import { Download } from "lucide-react";

interface PostGridProps {
  images: string[];
  type: "2x2" | "3x3";
}

export const PostGrid: React.FC<PostGridProps> = ({ images, type }) => {
  const gridClass = type === "2x2" ? "grid-cols-2" : "grid-cols-3";

  const handleDownload = (imgUrl: string, index: number) => {
    const link = document.createElement("a");
    link.href = imgUrl;
    link.download = `trendme-post-${index}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className={`grid ${gridClass} gap-1 w-full aspect-square bg-black border border-slate-800 rounded-lg overflow-hidden`}
    >
      {images.map((img, idx) => (
        <div key={idx} className="relative group overflow-hidden w-full h-full">
          <img
            src={img}
            alt={`Story part ${idx + 1}`}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button
              onClick={() => handleDownload(img, idx)}
              className="p-3 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Download Image"
              aria-label={`Download image ${idx + 1}`}
            >
              <Download size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
