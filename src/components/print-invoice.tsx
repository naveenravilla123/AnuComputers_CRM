"use client";
export default function PrintButton(){return <button className="no-print mb-4 rounded-xl bg-indigo-600 px-4 py-2 text-white" onClick={()=>window.print()}>Print / Save as PDF</button>}
