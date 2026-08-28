import { useEffect } from "react";

const setMeta = (attr, key, content) => {
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
    }
    el.setAttribute("content", content);
};

/**
 * Lightweight SEO for the SPA: document title, meta description, OpenGraph
 * tags and an optional JSON-LD block (used for public JobPosting pages).
 */
export const usePageMeta = ({ title, description, jsonLd }) => {
    const jsonLdString = jsonLd ? JSON.stringify(jsonLd) : null;
    useEffect(() => {
        if (title) {
            document.title = title;
            setMeta("property", "og:title", title);
        }
        if (description) {
            setMeta("name", "description", description);
            setMeta("property", "og:description", description);
        }
        let script = document.getElementById("page-jsonld");
        if (jsonLdString) {
            if (!script) {
                script = document.createElement("script");
                script.type = "application/ld+json";
                script.id = "page-jsonld";
                document.head.appendChild(script);
            }
            script.textContent = jsonLdString;
        } else if (script) {
            script.remove();
        }
    }, [title, description, jsonLdString]);
};
