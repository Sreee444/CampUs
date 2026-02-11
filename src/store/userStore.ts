let currentUser: unknown = null;

export const userStore = {
  get() {
    return currentUser;
  },
  set(user: unknown) {
    currentUser = user;
  },
  clear() {
    currentUser = null;
  },
};
