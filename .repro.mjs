import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:1100,height:800}});
await p.context().addCookies([{name:"ura_person",value:"d.withers",domain:"localhost",path:"/"}]);
await p.addInitScript(()=>sessionStorage.setItem("ura.assistant-width","1800"));
await p.goto("http://localhost:3100/projects/4f5b42f5-10d3-401e-a70d-f910b07b9c77/intake/description",{waitUntil:"domcontentloaded"});
await p.getByRole("button",{name:/Talk it through/i}).click();
await p.waitForTimeout(2000);
console.log("in the DOM:", await p.locator("section.assistant").count());
const info = await p.locator("section.assistant").evaluate(e=>{
  const r=e.getBoundingClientRect(), c=getComputedStyle(e);
  return {x:Math.round(r.x), right:Math.round(r.right), width:Math.round(r.width), styleWidth:c.width, visible:c.visibility, display:c.display};
}).catch(e=>String(e));
console.log("geometry:", JSON.stringify(info));
console.log("viewport width: 1100");
await b.close();
