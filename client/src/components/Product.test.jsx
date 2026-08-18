import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HybridMatch, StatusPill } from "./Product";
describe("production AI result UI",()=>{it("renders explainable score, confidence and limitations",()=>{render(<MemoryRouter><HybridMatch match={{overallScore:72,confidence:.81,recommendation:"review",componentScores:{requiredSkills:{score:80},semantic:{score:64}},matchedSkills:["node"],missingRequiredSkills:["kubernetes"],concerns:["Missing evidence"],limitations:["Decision-support score"]}}/></MemoryRouter>);expect(screen.getByText("72")).toBeInTheDocument();expect(screen.getByText("81% confidence")).toBeInTheDocument();expect(screen.getByText("kubernetes")).toBeInTheDocument();expect(screen.getByText(/Decision-support/)).toBeInTheDocument()});it("exposes status text",()=>{render(<StatusPill status="processing"/>);expect(screen.getByText("processing")).toBeInTheDocument()})});
