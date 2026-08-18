import { useEffect } from "react";
import { useLocation } from "react-router-dom";
const ScrollToTop=()=>{const{pathname}=useLocation();useEffect(()=>{window.scrollTo({top:0,behavior:"instant"});const timer=setTimeout(()=>{const target=document.querySelector("main h1")||document.querySelector("main");if(target){target.setAttribute("tabindex","-1");target.focus({preventScroll:true})}},0);return()=>clearTimeout(timer)},[pathname]);return null};
export default ScrollToTop;
