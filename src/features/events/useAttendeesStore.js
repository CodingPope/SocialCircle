// Description: Zustand store for managing attendees list state
import { create } from 'zustand';

const useAttendeesStore = create((set) => ({
  users: [],
  setUsers: (users) => set({ users }),
  selectedUser: null,
  setSelectedUser: (user) => set({ selectedUser: user }),
  modalVisible: false,
  setModalVisible: (visible) => set({ modalVisible: visible }),
}));

export default useAttendeesStore;
