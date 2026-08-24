const tabGroups = document.querySelectorAll<HTMLElement>('[data-tab-group]');

tabGroups.forEach((group) => {
  const tabs = [...group.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = [...group.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
  const progressSteps = [...group.querySelectorAll<HTMLElement>('[data-progress-phase]')];

  const activateTab = (nextIndex: number, moveFocus = false) => {
    const safeIndex = (nextIndex + tabs.length) % tabs.length;
    const activeTab = tabs[safeIndex];
    if (!activeTab) return;

    group.dataset.activeTab = String(safeIndex);

    tabs.forEach((tab, index) => {
      const selected = index === safeIndex;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });

    panels.forEach((panel, index) => {
      panel.hidden = index !== safeIndex;
    });

    progressSteps.forEach((step) => {
      const phase = Number(step.dataset.progressPhase ?? 0);
      step.dataset.progressState = phase < safeIndex ? 'done' : phase === safeIndex ? 'active' : 'next';
    });

    if (moveFocus) activeTab.focus();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(index));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') activateTab(0, true);
      if (event.key === 'End') activateTab(tabs.length - 1, true);
      if (event.key === 'ArrowLeft') activateTab(index - 1, true);
      if (event.key === 'ArrowRight') activateTab(index + 1, true);
    });
  });

  const selectedIndex = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
  activateTab(selectedIndex >= 0 ? selectedIndex : 0);
});

const permissionDemo = document.querySelector<HTMLElement>('[data-permission-demo]');

if (permissionDemo) {
  const actions = [...permissionDemo.querySelectorAll<HTMLButtonElement>('[data-permission-action]')];
  const reset = permissionDemo.querySelector<HTMLButtonElement>('[data-permission-reset]');
  const result = permissionDemo.querySelector<HTMLElement>('[data-permission-result]');
  const status = permissionDemo.querySelector<HTMLElement>('[data-permission-status]');

  const resetPermission = () => {
    permissionDemo.dataset.permissionState = 'pending';
    actions.forEach((button) => (button.disabled = false));
    if (reset) reset.hidden = true;
    if (result) result.textContent = 'Waiting for a decision.';
    if (status) status.textContent = 'Review';
  };

  actions.forEach((button) => button.addEventListener('click', () => {
    const approved = button.dataset.permissionAction === 'approve';
    permissionDemo.dataset.permissionState = approved ? 'approved' : 'held';
    actions.forEach((action) => (action.disabled = true));
    if (reset) reset.hidden = false;
    if (result) result.textContent = approved
      ? 'Preferred plumber can be booked.'
      : 'Returned to the maintenance coordinator.';
    if (status) status.textContent = approved ? 'Approved' : 'Held';
  }));

  reset?.addEventListener('click', resetPermission);
}
