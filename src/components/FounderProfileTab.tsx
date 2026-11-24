import React from 'react';
import {
  Award,
  Phone,
  Mail,
  MapPin,
  GraduationCap,
  ShieldCheck,
  Users,
  ArrowLeft,
  Building2,
  UserPlus,
} from 'lucide-react';
import { ORG_DETAILS } from '../data/mahasanghData';

interface FounderProfileTabProps {
  setCurrentTab: (tab: string) => void;
}

export const FounderProfileTab: React.FC<FounderProfileTabProps> = ({ setCurrentTab }) => {
  const navigate = (tab: string) => {
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="bg-[#fbf8f2] min-h-[75vh] py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Breadcrumb Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="inline-flex items-center gap-2 text-sm font-bold text-[#0b1e36] hover:text-amber-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>मुख्यपृष्ठावर परत जा</span>
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100/80 border border-amber-300/70 px-3 py-1 rounded-md">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
            <span>अधिकृत संस्थापक नेतृत्व परिचय</span>
          </span>
        </div>

        {/* Main Official Profile Card */}
        <article
          itemScope
          itemType="https://schema.org/Person"
          className="bg-white rounded-2xl border border-slate-200/90 shadow-lg overflow-hidden"
        >
          {/* Executive Navy Header Banner */}
          <div className="bg-gradient-to-br from-[#0b1e36] via-[#13325b] to-[#1a3e70] text-white p-6 sm:p-8 md:p-10 relative overflow-hidden">
            <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
            <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">
              <figure className="shrink-0 text-center">
                <picture>
                  <source srcSet="/president.webp" type="image/webp" />
                  <img
                    src="/president.jpg"
                    alt="श्री. राजेंद्र शिवाजी खैरनार (Rajendra Khairnar) — राज्याध्यक्ष, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ"
                    title="श्री. राजेंद्र शिवाजी खैरनार (Rajendra Khairnar) — राज्याध्यक्ष, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ"
                    itemProp="image"
                    width="180"
                    height="180"
                    loading="eager"
                    className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl object-cover object-top ring-4 ring-amber-400/85 shadow-2xl bg-white mx-auto"
                  />
                </picture>
                <figcaption className="sr-only">
                  श्री. राजेंद्र शिवाजी खैरनार (Rajendra Khairnar) — राज्याध्यक्ष, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
                </figcaption>
              </figure>

              <div className="flex-1 text-center sm:text-left space-y-2.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs sm:text-sm font-bold">
                  <Award className="w-4 h-4 text-amber-400 shrink-0" />
                  <span itemProp="jobTitle">
                    {ORG_DETAILS.founderPresident.role} (State President)
                  </span>
                </div>

                <h1
                  itemProp="name"
                  className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-black text-white leading-tight"
                >
                  {ORG_DETAILS.founderPresident.name}
                </h1>

                <p className="text-sm sm:text-base font-bold text-amber-200 tracking-wide">
                  Shri Rajendra Shivaji Khairnar (Rajendra Khairnar)
                </p>

                <div
                  itemProp="worksFor"
                  itemScope
                  itemType="https://schema.org/Organization"
                  className="pt-1 space-y-0.5"
                >
                  <p itemProp="name" className="text-base sm:text-lg font-extrabold text-white">
                    {ORG_DETAILS.name}
                  </p>
                  <p className="text-xs sm:text-sm text-slate-300 font-medium">
                    Maharashtra Rajya Kendrapramukh Va Adhikari Mahasangh · नोंदणी क्र.{' '}
                    {ORG_DETAILS.registrationNo}
                  </p>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                  <a
                    href={`tel:+91${ORG_DETAILS.founderPresident.phone}`}
                    itemProp="telephone"
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0b1e36] font-extrabold text-sm px-4 py-2 shadow-sm transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    <span>+91 {ORG_DETAILS.founderPresident.phone}</span>
                  </a>
                  <a
                    href={`mailto:${ORG_DETAILS.email}`}
                    itemProp="email"
                    className="inline-flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold text-sm px-4 py-2 transition-colors"
                  >
                    <Mail className="w-4 h-4 text-amber-300" />
                    <span>{ORG_DETAILS.email}</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Profile Details Body */}
          <div className="p-6 sm:p-8 space-y-6">
            {/* Key Identity Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#0b1e36]/10 text-[#0b1e36] flex items-center justify-center shrink-0">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    शैक्षणिक व व्यावसायिक पात्रता
                  </h2>
                  <p className="text-sm sm:text-base font-bold text-[#0b1e36] mt-1 font-mono">
                    {ORG_DETAILS.founderPresident.education}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div itemProp="address" itemScope itemType="https://schema.org/PostalAddress">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    मुख्य कार्यालय व कार्यक्षेत्र
                  </h2>
                  <p className="text-sm font-bold text-[#0b1e36] mt-1">
                    <span itemProp="streetAddress">131, पाटणे, ता. मालेगाव</span>, जि.{' '}
                    <span itemProp="addressLocality">नाशिक</span>,{' '}
                    <span itemProp="addressRegion">महाराष्ट्र</span> —{' '}
                    <span itemProp="postalCode">423203</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    कार्यक्षेत्र: महाराष्ट्र राज्य (34 जिल्हे · 350+ तालुके)
                  </p>
                </div>
              </div>
            </div>

            {/* Founder Message */}
            <section className="rounded-xl bg-amber-50/70 border border-amber-200/80 p-5 sm:p-6">
              <h2 className="text-sm sm:text-base font-extrabold text-[#0b1e36] flex items-center gap-2 mb-2.5">
                <Building2 className="w-4 h-4 text-amber-700" />
                <span>राज्याध्यक्ष यांचा संदेश</span>
              </h2>
              <blockquote className="text-sm sm:text-base text-slate-700 leading-relaxed italic border-l-4 border-amber-500 pl-4">
                "{ORG_DETAILS.founderPresident.message}"
              </blockquote>
            </section>

            {/* Bilingual Overview for Citizens & Search Engines */}
            <section className="space-y-3 text-sm sm:text-base text-slate-700 leading-relaxed">
              <h2 className="text-base sm:text-lg font-extrabold text-[#0b1e36]">
                संघटनात्मक नेतृत्व व कार्यपरिचय
              </h2>
              <p>
                <strong>श्री. राजेंद्र शिवाजी खैरनार</strong> हे{' '}
                <strong>महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ</strong> (नोंदणी क्र.{' '}
                {ORG_DETAILS.registrationNo}) चे संस्थापक राज्याध्यक्ष आहेत. प्राथमिक शिक्षण व्यवस्थेचा कणा असणाऱ्या केंद्रप्रमुख व शिक्षण विस्तार अधिकारी संवर्गाचे वेतन विसंगती निवारण, पदोन्नती धोरण, सेवा नियमावली सुधारणा आणि शैक्षणिक गुणवत्ता वाढीसाठी ते राज्यातील सर्व 34 जिल्ह्यांत प्रभावी नेतृत्व करत आहेत.
              </p>
              <p className="text-slate-600 text-sm">
                <strong>Shri Rajendra Shivaji Khairnar (Rajendra Khairnar)</strong> is the Founder
                State President (राज्याध्यक्ष) of{' '}
                <strong>Maharashtra Rajya Kendrapramukh Va Adhikari Mahasangh</strong> (Mahasangh),
                representing Kendrapramukh (Cluster Heads) and Education Extension Officers across
                34 districts and 350+ talukas of Maharashtra.
              </p>
            </section>

            {/* Action Links */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center gap-3">
              <a
                href="/leadership"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('leadership');
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0b1e36] hover:bg-[#13325b] text-white font-bold text-sm px-4 py-2.5 transition-colors"
              >
                <Users className="w-4 h-4 text-amber-400" />
                <span>राज्य कार्यकारिणी पहा</span>
              </a>
              <a
                href="/membership"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('membership');
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-[#0b1e36] font-extrabold text-sm px-4 py-2.5 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>ऑनलाईन सदस्यत्व नोंदणी</span>
              </a>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
};

export default FounderProfileTab;
