const { test, expect } = require('./fixtures.cjs');
const { enterPortal, enterStudentApp } = require('./portal-session.cjs');

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'desktop-1280', width: 1280, height: 800 }
];

for (const vp of VIEWPORTS) {
  test(`Class Chat renders edge-to-edge full-screen across Student, Teacher, Manager & Admin on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    // 1. Student portal
    await enterStudentApp(page, { id: 'STU-FS-10', name: 'রাইসা ইসলাম', className: 'দশম শ্রেণি' });
    await page.locator('#classChatTopbarButton').click();
    await expect(page.locator('#classChatView .class-chat-shell')).toBeVisible();

    const studentMetrics = await page.evaluate(() => {
      const shell = document.querySelector('#classChatView .class-chat-shell');
      const topbar = document.querySelector('.app-topbar');
      const bottomNav = document.querySelector('.bottom-nav');
      const backBtn = shell.querySelector('[data-chat-action="go-back"]');
      const sendBtn = shell.querySelector('[data-chat-action="send"]');
      const rect = shell.getBoundingClientRect();
      const backRect = backBtn.getBoundingClientRect();
      const sendRect = sendBtn.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        topbarDisplay: getComputedStyle(topbar).display,
        bottomDisplay: getComputedStyle(bottomNav).display,
        backW: Math.round(backRect.width),
        backH: Math.round(backRect.height),
        sendH: Math.round(sendRect.height),
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth
      };
    });
    expect(studentMetrics.x).toBe(0);
    expect(studentMetrics.y).toBe(0);
    expect(studentMetrics.width).toBe(vp.width);
    expect(studentMetrics.height).toBe(vp.height);
    expect(studentMetrics.topbarDisplay).toBe('none');
    expect(studentMetrics.bottomDisplay).toBe('none');
    expect(studentMetrics.backW).toBeGreaterThanOrEqual(44);
    expect(studentMetrics.backH).toBeGreaterThanOrEqual(44);
    expect(studentMetrics.sendH).toBeGreaterThanOrEqual(44);
    expect(studentMetrics.noHorizontalOverflow).toBe(true);

    // Exit full-screen via WhatsApp back button -> restores portal bars & normal layout
    await page.locator('#classChatView [data-chat-action="go-back"]').click();
    await expect(page.locator('#homeView')).toBeVisible();
    await expect(page.locator('.app-topbar')).toBeVisible();
    await expect(page.locator('.bottom-nav')).toBeVisible();

    // 2. Teacher, Manager & Admin portals
    for (const role of ['teacher', 'manager', 'admin']) {
      await enterPortal(page, role);
      await page.locator('#classChatTopbarButton').click();
      const mountSelector = {
        teacher: '#teacherClassChatMount .class-chat-shell',
        manager: '#managerClassChatMount .class-chat-shell',
        admin: '#adminClassChatMount .class-chat-shell'
      }[role];
      await expect(page.locator(mountSelector)).toBeVisible();

      const staffMetrics = await page.evaluate(sel => {
        const shell = document.querySelector(sel);
        const topbar = document.querySelector('.app-topbar');
        const bottomNav = document.querySelector('.admin-bottom');
        const backBtn = shell.querySelector('[data-chat-action="go-back"]');
        const sendBtn = shell.querySelector('[data-chat-action="send"]');
        const rect = shell.getBoundingClientRect();
        const backRect = backBtn.getBoundingClientRect();
        const sendRect = sendBtn.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          topbarDisplay: getComputedStyle(topbar).display,
          bottomDisplay: getComputedStyle(bottomNav).display,
          backW: Math.round(backRect.width),
          backH: Math.round(backRect.height),
          sendH: Math.round(sendRect.height),
          noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth
        };
      }, mountSelector);

      expect(staffMetrics.x, `${role} x on ${vp.name}`).toBe(0);
      expect(staffMetrics.y, `${role} y on ${vp.name}`).toBe(0);
      expect(staffMetrics.width, `${role} width on ${vp.name}`).toBe(vp.width);
      expect(staffMetrics.height, `${role} height on ${vp.name}`).toBe(vp.height);
      expect(staffMetrics.topbarDisplay, `${role} topbar on ${vp.name}`).toBe('none');
      expect(staffMetrics.bottomDisplay, `${role} bottom on ${vp.name}`).toBe('none');
      expect(staffMetrics.backW, `${role} backW on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(staffMetrics.backH, `${role} backH on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(staffMetrics.sendH, `${role} sendH on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(staffMetrics.noHorizontalOverflow, `${role} overflow on ${vp.name}`).toBe(true);

      // Exit full-screen via WhatsApp back button -> restores portal bars & normal layout
      await page.locator(`${mountSelector} [data-chat-action="go-back"]`).click();
      await expect(page.locator('.app-topbar')).toBeVisible();
      await expect(page.locator('.admin-bottom')).toBeVisible();
    }
  });
}
