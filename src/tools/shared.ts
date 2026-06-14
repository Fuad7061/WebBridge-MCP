import { type Page, type Locator } from 'playwright';

export async function findElement(page: Page, selector: string): Promise<Locator | null> {
  const mainLoc = page.locator(selector);
  if (await mainLoc.count() > 0) return mainLoc;

  const frames = page.frames();
  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    const frameLoc = frame.locator(selector);
    if (await frameLoc.count() > 0) return frameLoc;
  }

  return null;
}
