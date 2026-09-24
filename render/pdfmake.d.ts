// pdfmake ships no types for its Node entry or its font container; render/pdf.ts
// is the only module that touches them, and it narrows what it uses.
declare module 'pdfmake';
declare module 'pdfmake/build/fonts/Roboto.js';
