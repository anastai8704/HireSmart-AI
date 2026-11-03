import { Component } from "react";
import Button from "./ui/Button";
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error("UI boundary", error, info.componentStack);
  }
  render() {
    if (this.state.error)
      return (
        <main className="grid min-h-screen place-items-center bg-canvas p-6">
          <div className="panel max-w-lg p-8 text-center">
            <p className="eyebrow">Interface error</p>
            <h1 className="mt-2 text-2xl font-bold">This view could not be rendered.</h1>
            <p className="mt-3 text-sm text-ink-500">
              Your last server operation may still have completed. Reload before trying the action
              again.
            </p>
            <Button className="mt-6" onClick={() => window.location.reload()}>
              Reload HireSmart
            </Button>
          </div>
        </main>
      );
    return this.props.children;
  }
}
