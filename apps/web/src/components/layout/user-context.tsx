"use client";

import { createContext, useContext } from "react";

interface UserContextValue {
  readonly avatarUrl: string | null;
  readonly displayName: string;
}

const UserContext = createContext<UserContextValue>({
  avatarUrl: null,
  displayName: "User",
});

export function useUser() {
  return useContext(UserContext);
}

export function UserProvider({
  avatarUrl,
  displayName,
  children,
}: UserContextValue & { readonly children: React.ReactNode }) {
  return (
    <UserContext.Provider value={{ avatarUrl, displayName }}>
      {children}
    </UserContext.Provider>
  );
}
