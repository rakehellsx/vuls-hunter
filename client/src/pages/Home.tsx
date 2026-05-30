import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useApp } from "@/contexts/AppContext";
import Overview from "./Overview";
import QuickScan from "./QuickScan";
import Projects from "./Projects";
import Rules from "./Rules";
import Reports from "./Reports";
import Engine from "./Engine";
import Audit from "./Audit";
import Settings from "./Settings";

export default function Home() {
  const { activeTab } = useApp();

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return <Overview />;
      case "quick-scan":
        return <QuickScan />;
      case "projects":
        return <Projects />;
      case "rules":
        return <Rules />;
      case "reports":
        return <Reports />;
      case "engine":
        return <Engine />;
      case "audit":
        return <Audit />;
      case "settings":
        return <Settings />;
      default:
        return <Overview />;
    }
  };

  return <DashboardLayout>{renderContent()}</DashboardLayout>;
}
