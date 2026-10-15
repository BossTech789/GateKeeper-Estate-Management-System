
import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  user: null,
  authStatus: "checking",
  authError: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser(state, action) {
      state.user = action.payload;
      state.authError = null;
    },

    setAuthStatus(state, action) {
      state.authStatus = action.payload;
    },

    setAuthError(state, action) {
      state.authError = action.payload;
    },

    clearAuth(state) {
      state.user = null;
      state.authStatus = "unauthenticated";
      state.authError = null;
    },
  },
});

export const {
  setUser,
  setAuthStatus,
  setAuthError,
  clearAuth,
} = authSlice.actions;

export default authSlice.reducer;
