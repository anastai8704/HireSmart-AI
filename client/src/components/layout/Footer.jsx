import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
const Footer = () => (
  <footer className="border-t border-ink-200 bg-white">
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
      <div>
        <Link to="/" className="flex items-center gap-2 font-bold">
          <Sparkles className="h-4 w-4 text-brand-600" />
          HireSmart AI
        </Link>
        <p className="mt-3 max-w-sm text-sm leading-6 text-ink-500">
          Evidence-led recruitment workflows with explainable AI and humans in control.
        </p>
      </div>
      <div>
        <p className="text-sm font-semibold">Product</p>
        <div className="mt-3 space-y-2 text-sm text-ink-500">
          <Link className="block hover:text-ink-900" to="/jobs">
            Jobs
          </Link>
          <Link className="block hover:text-ink-900" to="/resume-check">
            Resume check
          </Link>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold">Trust</p>
        <p className="mt-3 text-sm leading-6 text-ink-500">
          AI scores support review; they never make autonomous hiring decisions.
        </p>
      </div>
    </div>
    <div className="border-t border-ink-100 py-4 text-center text-xs text-ink-400">
      © {new Date().getFullYear()} HireSmart AI
    </div>
  </footer>
);
export default Footer;
