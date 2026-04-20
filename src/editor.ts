import type { AppState, StarSystem } from './types';

let currentSystem: StarSystem | null = null;
let onUpdateCallback: ((system: StarSystem, gmNotes: string) => void) | null = null;

export function initEditor(
  state: AppState,
  onUpdate: (system: StarSystem, gmNotes: string) => void
): void {
  onUpdateCallback = onUpdate;

  // Tab switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      if (!target) return;

      tabBtns.forEach((b) => b.classList.remove('active'));
      tabPanels.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const panel = document.getElementById(`tab-${target}`);
      if (panel) panel.classList.add('active');
    });
  });

  // Editor inputs
  const editName = document.getElementById('edit-name') as HTMLInputElement | null;
  const editStarClass = document.getElementById('edit-star-class') as HTMLSelectElement | null;
  const editStarGrade = document.getElementById('edit-star-grade') as HTMLSelectElement | null;
  const editWorldType = document.getElementById('edit-world-type') as HTMLSelectElement | null;
  const editGmNotes = document.getElementById('edit-gm-notes') as HTMLTextAreaElement | null;

  function emitUpdate() {
    if (!currentSystem || !onUpdateCallback) return;
    if (editName) currentSystem.key = editName.value;
    if (editStarClass) currentSystem.primaryStar.class = editStarClass.value;
    if (editStarGrade) currentSystem.primaryStar.grade = parseInt(editStarGrade.value, 10);
    if (editWorldType && currentSystem.mainWorld) {
      currentSystem.mainWorld.type = editWorldType.value as 'Terrestrial' | 'Dwarf' | 'Ice World';
    }
    const gmNotes = editGmNotes?.value || '';
    onUpdateCallback(currentSystem, gmNotes);
  }

  [editName, editStarClass, editStarGrade, editWorldType, editGmNotes].forEach((el) => {
    if (el) {
      el.addEventListener('input', emitUpdate);
      el.addEventListener('change', emitUpdate);
    }
  });
}

export function setEditorSystem(system: StarSystem | null, gmNotes: string): void {
  currentSystem = system;

  const editorEmpty = document.getElementById('editor-empty');
  const editorForm = document.getElementById('editor-form');

  if (!system) {
    if (editorEmpty) editorEmpty.style.display = '';
    if (editorForm) editorForm.style.display = 'none';
    return;
  }

  if (editorEmpty) editorEmpty.style.display = 'none';
  if (editorForm) editorForm.style.display = '';

  const editName = document.getElementById('edit-name') as HTMLInputElement | null;
  const editStarClass = document.getElementById('edit-star-class') as HTMLSelectElement | null;
  const editStarGrade = document.getElementById('edit-star-grade') as HTMLSelectElement | null;
  const editWorldType = document.getElementById('edit-world-type') as HTMLSelectElement | null;
  const editGmNotes = document.getElementById('edit-gm-notes') as HTMLTextAreaElement | null;

  if (editName) editName.value = system.key || '';
  if (editStarClass) editStarClass.value = system.primaryStar.class;
  if (editStarGrade) editStarGrade.value = String(system.primaryStar.grade);
  if (editWorldType && system.mainWorld) editWorldType.value = system.mainWorld.type;
  if (editGmNotes) editGmNotes.value = gmNotes;
}
