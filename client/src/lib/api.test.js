import { describe,expect,it } from "vitest";
import { normalize } from "./api";
describe("API boundary",()=>{it("normalizes Mongo ids",()=>expect(normalize({_id:"abc",name:"A"})).toEqual({_id:"abc",id:"abc",name:"A"}));it("prefers stable id",()=>expect(normalize({_id:"old",id:"new"}).id).toBe("new"))});
