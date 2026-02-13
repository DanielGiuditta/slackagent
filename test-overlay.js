// Test script to check for overlay elements blocking the sidebar
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5001');
  await page.waitForSelector('aside'); // Wait for sidebar to load
  
  // Check for full-screen overlay elements
  const overlays = await page.evaluate(() => {
    const elements = [];
    
    // Find all elements with fixed positioning
    const allElements = document.querySelectorAll('*');
    allElements.forEach(el => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      
      // Check if element is fixed/absolute and covers significant screen area
      if ((style.position === 'fixed' || style.position === 'absolute') && 
          (style.zIndex && parseInt(style.zIndex) > 0)) {
        elements.push({
          tag: el.tagName,
          className: el.className,
          id: el.id,
          position: style.position,
          zIndex: style.zIndex,
          inset: style.inset,
          width: rect.width,
          height: rect.height,
          pointerEvents: style.pointerEvents,
          background: style.background,
        });
      }
    });
    
    return elements;
  });
  
  console.log('Overlay elements found:', JSON.stringify(overlays, null, 2));
  
  // Test clicking the Autopilot button
  const autopilotButton = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(btn => btn.textContent.includes('Autopilot'));
  });
  
  if (autopilotButton) {
    console.log('Autopilot button found');
    
    // Check if button is clickable
    const isClickable = await page.evaluate((btn) => {
      const rect = btn.getBoundingClientRect();
      const elementAtPoint = document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2);
      return elementAtPoint === btn || btn.contains(elementAtPoint);
    }, autopilotButton);
    
    console.log('Button is clickable:', isClickable);
    
    if (!isClickable) {
      const blockingElement = await page.evaluate((btn) => {
        const rect = btn.getBoundingClientRect();
        const elementAtPoint = document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2);
        const style = window.getComputedStyle(elementAtPoint);
        return {
          tag: elementAtPoint.tagName,
          className: elementAtPoint.className,
          id: elementAtPoint.id,
          zIndex: style.zIndex,
          pointerEvents: style.pointerEvents,
        };
      }, autopilotButton);
      
      console.log('Element blocking the button:', blockingElement);
    }
  } else {
    console.log('Autopilot button not found!');
  }
  
  await browser.close();
})();
