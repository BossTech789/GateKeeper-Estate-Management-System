

"use client";

import { useEffect } from "react";
import { Provider, useDispatch } from "react-redux";
import { store } from "./index";
import { startAuthListener } from "@/lib/authListener";

function AuthListener() {
  const dispatch = useDispatch();

  useEffect(() => {
    const unsubscribe = startAuthListener(dispatch);

    return () => unsubscribe();
  }, [dispatch]);

  return null;
}

export default function Providers({ children }) {
  return (
    <Provider store={store}>
      <AuthListener />
      {children}
    </Provider>
  );
}