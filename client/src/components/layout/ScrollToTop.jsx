/**
 * ScrollToTop.jsx
 * -----------------------------------------------------------------------------
 * A single-page app does not reload the document when the route changes, so the
 * browser keeps the previous scroll position. Navigating from halfway down a
 * long job list into a job detail page would drop you in the middle of it.
 *
 * This component renders nothing; it just resets the scroll on every
 * navigation, restoring the behaviour users expect from a normal website.
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const ScrollToTop = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: "instant" });
    }, [pathname]);

    return null;
};

export default ScrollToTop;
