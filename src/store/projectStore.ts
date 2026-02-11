let currentProjects: unknown[] = [];

export const projectStore = {
  getAll() {
    return currentProjects;
  },
  setAll(projects: unknown[]) {
    currentProjects = projects;
  },
  clear() {
    currentProjects = [];
  },
};
