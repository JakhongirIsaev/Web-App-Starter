import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "./ru.json";
import uz from "./uz.json";

const savedLang = localStorage.getItem("minerva_lang") || "ru";

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    uz: { translation: uz },
  },
  lng: savedLang,
  fallbackLng: "ru",
  interpolation: { escapeValue: false },
});

export default i18n;
