import React from "react";
import packageInfo from "../../package.json";

interface FooterProps {
  theme: "light" | "dark";
}

const Footer: React.FC<FooterProps> = ({ theme }) => {
  return (
    <footer className={`app-footer ${theme}`}>
      <div className="footer-content">
        <span className="version">v{packageInfo.version}</span>
        <a
          href="https://github.com/ThatOrJohn/flowturi"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
};

export default Footer;
