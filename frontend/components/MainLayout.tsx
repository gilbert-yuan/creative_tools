
import React from 'react';
import Header from './Header';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="main-layout-bg">
      <Header />
      {children}
    </div>
  );
}