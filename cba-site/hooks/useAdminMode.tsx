"use client";

import { useState, useEffect } from 'react';

export function useAdminMode() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(localStorage.getItem('cba_admin_mode') === '1');
  }, []);

  function unlock() {
    const pin = window.prompt('Enter admin PIN:');
    if (pin === null) return;
    if (pin === process.env.NEXT_PUBLIC_ADMIN_PIN) {
      localStorage.setItem('cba_admin_mode', '1');
      setIsAdmin(true);
    } else {
      alert('Incorrect PIN');
    }
  }

  return { isAdmin, unlock };
}
