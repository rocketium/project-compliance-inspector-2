
import React, { useState, useEffect } from 'react';
import {
  analyzeImageWithGemini,
  checkComplianceWithGemini,
} from "./services/gemini";
import {
  AnalysisResult,
  AppState,
  PlatformConfig,
  ComplianceResult,
} from "./types";
import { ResultsView } from "./components/ResultsView";
import {
  UploadCloud,
  FileImage,
  AlertCircle,
  Sparkles,
  Settings,
  ChevronDown,
  Moon,
  Sun,
  LogOut,
} from "lucide-react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { AdminPanel } from "./components/AdminPanel";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { useAuth } from "./contexts/AuthContext";
import { Login } from "./components/Login";

// Fallback platforms in case fetch fails
// This is a simplified subset - full data is in /public/platforms.json
const DEFAULT_PLATFORMS: PlatformConfig[] = [
  {
    id: "default",
    name: "Default",
    category: "other",
    prompt:
      "\n      Analyze this advertisement or design image in extreme detail.\n      \n      Your task is to decompose the image into its constituent parts for a design system.\n      Identify all distinct elements:\n      1. Text blocks (headlines, body copy, disclaimers, prices).\n      2. Visual elements (product shots, logos, icons, buttons, graphical shapes).\n      \n      For each element identified:\n      - Classify it into one of these categories: 'Text', 'Logo', 'Product', 'Button', 'Other'.\n      - Provide the exact text content (if it is text) or a concise visual description (if it is an image).\n      - precise bounding box coordinates (ymin, xmin, ymax, xmax) normalized to 0-1000 scale.\n      - A detailed polygon outline of the object's shape (list of x,y coordinates).\n      \n      Be very precise with the bounding boxes. Do not overlap boxes if possible unless elements are nested.\n      Ensure every visible piece of significant content is captured.\n    ",
  },
  {
    id: "am-fuse",
    name: "Amazon Fuse",
    category: "ecommerce",
    prompt:
      "\n      You are a Co-Branding Compliance AI specialized in Amazon Fuse partner integrations.\n      Your specific goal is to distinguish between the HOST SERVICE (Amazon) and the PARTNER BRAND (Third Party).\n      \n      RULES FOR CLASSIFICATION:\n      \n      1. **Partner Attribution (Category: 'Partner')**:\n         - ANY logo that is NOT Amazon, Prime, or Twitch.\n         - Examples: Samsung, Verizon, Vodafone, O2, Movistar, Xiaomi, Google Pixel.\n         - If you see 'Samsung', it is ALWAYS 'Partner'.\n      \n      2. **Service Attribution (Category: 'Logo')**:\n         - ONLY Amazon proprietary brands.\n         - Examples: 'Amazon Prime', 'Prime Video', 'Amazon Music', 'Audible', 'Twitch'.\n         - These are NEVER 'Partner'.\n      \n      3. **Other Elements**:\n         - **The Offer**: Headlines describing the deal -> 'Text'\n         - **Legal**: Terms, conditions, small print -> 'Text'\n         - **Key Art**: Movie posters, album art, game covers -> 'Product'\n         - **Hardware**: Phones, remotes, tablets -> 'Product'\n         - **CTA**: Buttons like 'Sign up now' -> 'Button'\n      \n      OUTPUT INSTRUCTIONS:\n      - For 'content', just provide the text or name (e.g. 'Samsung', 'Amazon Prime'). Do not add prefixes like 'Partner Logo:'.\n      - Ensure 'Samsung' logo is assigned category 'Partner'.\n      - Ensure 'Amazon Prime' logo is assigned category 'Logo'.\n    ",
    complianceRules: [
      "Do not add outlines, shapes, or effects (shadows, gradients, glows) to the Amazon/Prime logo.",
      "Do not reposition, resize, rotate (upside down/vertically), or alter the Smile brand mark.",
      "Do not show a logo other than the Smile mark unless representative of a specific marketplace.",
      "Do not use a registered trademark symbol (® or ™) with Amazon logos.",
      "Do not use 2 different Amazon logos in the same creative.",
      "Do not crop, recolor, or composite the Amazon box imagery in a way that distorts or obscures it.",
      "Do not composite people, products, or graphics into approved box imagery.",
      "Do not add text or third-party messaging coming out of the box.",
      "Do not place the box on dark or busy backgrounds where legibility is compromised.",
      "Do not cut the Prime logo on the blue strip of the box.",
      "Do not scale the box so that it is not legible.",
      "Do not make a character out of the box (e.g., adding smile emoji).",
      "Do not use a box with dents, scuffs, or visible damage.",
      "Do not overlap the smile on the box with the Blue strip.",
      "Ensure the Partner logo and Amazon logo are visually consistent in scale (Partner should not be significantly larger/smaller).",
      "Use sentence case in text copy (no ALL CAPS headlines unless specific exception).",
      "Amazon Prime should not be referred to as a 'gift card'.",
      "Verify phrasing: Partners must not say 'watch on [Partner]' (should be 'watch on Prime Video').",
    ],
    imageSpecs: {
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 500,
    },
  },
  {
    id: "am-ads",
    name: "Amazon Ads",
    category: "ecommerce",
    prompt:
      "\n      Analyze this image specifically as an e-commerce advertisement or sponsored display for Amazon Ads (onsite & offsite display, stores).\n      Focus on extracting the commercial logic of the ad and verifying compliance with Amazon ad specs & policies.\n      \n      Identify:\n      1. **The Product**: The main product image. Classify as 'Product'.\n      2. **Brand Identity**: The brand logo or seller name. Classify as 'Logo'.\n      3. **Pricing & Deals**: Price tags, 'Save 20%', 'Prime Exclusive'. Classify as 'Text'.\n      4. **Ratings**: Star ratings or review counts. Classify as 'Other'.\n      5. **CTA**: 'Shop Now', 'Add to Cart'. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Verify file types (JPG/PNG), dimensions (e.g., 300×250, 728×90), and file weight.\n      - Check safe-area requirements for logos and text.\n      - Assess text density and legibility.\n      - Verify policy alignment with Better Ads Standards.\n      - Check for misleading claims and substantiation requirements.\n      - Verify logo minimum size requirements.\n      - Check for alt-text presence.\n      \n      Provide exact text extraction for prices and claims.\n      Provide detailed polygon outlines for the product image to separate it from the background.\n    ",
    complianceRules: [
      "Image files must be in allowed formats: JPG or PNG only.",
      "Verify image dimensions match common sizes (e.g., 300×250, 728×90) or approved custom sizes.",
      "File weight must not exceed maximum allowed per size specification.",
      "Logos and text must be within safe-area boundaries.",
      "Text overlay must not be excessive (flag if text density is too high).",
      "CTA button must be present and clearly visible.",
      "Logo must meet minimum size requirements.",
      "Alt-text must be present for accessibility.",
      "No misleading claims or unsubstantiated statements.",
      "Content must align with Better Ads Standards policies.",
      "Video content must comply with duration limits if applicable.",
    ],
    imageSpecs: {
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 200,
      aspectRatios: ["1:1", "16:9", "4:3"],
    },
  },
  {
    id: "walmart-connect",
    name: "Walmart Connect",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for Walmart Connect onsite display placement.\n      Focus on creative best practices and brand clarity according to 'The art of the cart – display ad creative guide'.\n      \n      Identify:\n      1. **Product**: Main product imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity and logos. Classify as 'Logo'.\n      3. **Headline**: Main headline text. Classify as 'Text'.\n      4. **CTA**: Call-to-action buttons. Classify as 'Button'.\n      5. **Other Elements**: Additional visual elements. Classify as 'Other'.\n      \n      For compliance evaluation:\n      - Verify headline length is concise (best practice).\n      - Check that imagery shows a single focal product.\n      - Assess contrast ratio for readability.\n      - Score brand/logo visibility in first frame.\n      - Verify CTA presence and clarity.\n      - Check animation restraint (if animated).\n      - Calculate 'cart-fit' score based on overall creative quality.\n      \n      Verify baseline display specs match portal requirements.\n    ",
    complianceRules: [
      "Headline text must be concise and within recommended length limits.",
      "Imagery must feature a single focal product (avoid cluttered product displays).",
      "Contrast ratio must meet minimum readability standards.",
      "Brand/logo must be visible and prominent in the first frame.",
      "CTA button must be present and clearly visible.",
      "Animation must be restrained and not distracting.",
      "Creative must score well on 'cart-fit' evaluation (brand cues, product clarity, CTA presence).",
      "Display specs must match baseline requirements verified in portal.",
    ],
    imageSpecs: {
      allowedFormats: ["jpg", "png", "gif"],
      maxFileSizeKB: 150,
    },
  },
  {
    id: "target-roundel",
    name: "Target Roundel",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for Target Roundel across product ads, display, and CTV placements.\n      Focus on placement-specific compliance and native look requirements per Roundel Ad Guide.\n      \n      Identify:\n      1. **Product**: Product imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity and logo lockups. Classify as 'Logo'.\n      3. **Text**: Headlines and copy. Classify as 'Text'.\n      4. **CTA**: Call-to-action elements. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - **Product Ads**: Verify image aspect ratio, check max text on tile.\n      - **Display**: Verify standard IAB sizes are used.\n      - **CTV**: Check video length, verify safe title cards.\n      - Verify link-out tracking is present.\n      - Assess native look compliance (should blend with platform aesthetic).\n      - Check that copy is short and concise.\n      - Verify logo lockups meet specifications.\n      \n      Reference Roundel Ad Guide (spec hub) for specific requirements.\n    ",
    complianceRules: [
      "Product ads must use correct image aspect ratio per spec.",
      "Product ads must not exceed maximum text allowed on tile.",
      "Display ads must use standard IAB sizes.",
      "CTV video content must comply with length requirements.",
      "CTV must include safe title cards.",
      "Link-out tracking must be present and functional.",
      "Creative must achieve native look compliance (blend with platform aesthetic).",
      "Copy must be short and concise.",
      "Logo lockups must meet Roundel specifications.",
      "Placement-specific specs must be verified via Ad Guide.",
    ],
    imageSpecs: {
      allowedFormats: ["jpg", "png"],
      aspectRatios: ["1:1", "4:5", "16:9"],
    },
  },
  {
    id: "instacart-ads",
    name: "Instacart Ads",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for Instacart Ads (display banners and shoppable video).\n      Focus on image dimensions, copy length, and creative focus per Instacart banner & shoppable video guidelines.\n      \n      Identify:\n      1. **Product**: Product imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity. Classify as 'Logo'.\n      3. **Ad Copy**: Headline and text content. Classify as 'Text'.\n      4. **CTA**: Call-to-action buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - **Display Banners**: Verify dimensions (min 1067×600, max 1600×900).\n      - **Ad Copy**: Check maximum character limit (~22 chars).\n      - **Shoppable Video**: Verify file size cap and length limits.\n      - Flag low-focus imagery (product should be clear and prominent).\n      - Flag text-heavy creative (should be minimal text).\n      - Assess image focus and context (product should be in appropriate context).\n      \n      Reference Instacart media dimensions documentation.\n    ",
    complianceRules: [
      "Display banner dimensions must be between 1067×600 (min) and 1600×900 (max).",
      "Ad copy must not exceed approximately 22 characters.",
      "Shoppable video must comply with file size caps.",
      "Shoppable video must comply with length limits.",
      "Imagery must have clear focus (flag low-focus imagery).",
      "Creative must not be text-heavy (minimal text required).",
      "Product must be shown in appropriate context.",
      "Image focus and clarity must be high.",
    ],
    imageSpecs: {
      minWidth: 1067,
      maxWidth: 1600,
      minHeight: 600,
      maxHeight: 900,
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 500,
    },
  },
  {
    id: "kroger-precision-marketing",
    name: "Kroger Precision Marketing",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for Kroger Precision Marketing across onsite display, in-image, OLV, and social syndication.\n      Focus on exhaustive size matrix compliance, file naming conventions, and early branding requirements per KPM spec sheets.\n      \n      Identify:\n      1. **Product**: Product imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity. Classify as 'Logo'.\n      3. **CTA**: Call-to-action buttons. Classify as 'Button'.\n      4. **Text**: Headlines and copy. Classify as 'Text'.\n      \n      For compliance evaluation:\n      - **Display**: Verify full spec grid (55 files for animated variants across banners).\n      - **CTA**: Check character limit (≤15 chars).\n      - **In-Image**: Verify reuse of 728×90 & 300×250 sizes.\n      - **OLV (Online Video)**: Check early branding (brand presence by 3–5 seconds).\n      - Verify file naming convention compliance.\n      - Assess brand presence timing in video content.\n      \n      Reference KPM spec sheets (June/July 2025) for complete requirements.\n    ",
    complianceRules: [
      "Display ads must match full spec grid (55 files for animated variants across banners).",
      "CTA text must not exceed 15 characters.",
      "In-image ads must reuse 728×90 and 300×250 sizes.",
      "OLV (Online Video) must show brand presence within 3–5 seconds.",
      "File naming convention must comply with KPM specifications.",
      "Animated variants must match all 55 specified banner sizes.",
      "Brand must be clearly visible early in video content (3–5 second rule).",
    ],
    imageSpecs: {
      allowedFormats: ["jpg", "png", "gif"],
      maxFileSizeKB: 200,
    },
  },
  {
    id: "cvs-media-exchange",
    name: "CVS Media Exchange (CMX)",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for CVS Media Exchange (CMX) across onsite & offsite display and landing pages.\n      Focus on template adherence, typography standards, and accessibility ordering per CMX ad-specs PDFs.\n      \n      Identify:\n      1. **Product**: Product imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity. Classify as 'Logo'.\n      3. **Headline**: Main headline text. Classify as 'Text'.\n      4. **Subhead**: Subheadline text. Classify as 'Text'.\n      5. **Legal**: Legal text and disclaimers. Classify as 'Text'.\n      6. **CTA**: Call-to-action buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Verify PSD/template adherence (must match approved templates).\n      - Check typography (fixed text styles: Helvetica).\n      - Verify content order for accessibility (image alt, headline, subhead, legal, CTA).\n      - Ensure proper screen reader ordering.\n      - Verify all required elements are present.\n      \n      Reference CMX ad-specs PDFs (2024–2025) for complete requirements.\n    ",
    complianceRules: [
      "Creative must adhere to approved PSD/template specifications.",
      "Typography must use fixed text styles (Helvetica).",
      "Content must follow accessibility ordering: image alt text, headline, subhead, legal, CTA.",
      "Screen reader ordering must be correct for accessibility compliance.",
      "All required template elements must be present.",
      "Legal text must be included and properly positioned.",
      "Image alt-text must be present and descriptive.",
    ],
    imageSpecs: {
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 150,
    },
  },
  {
    id: "walgreens-advertising-group",
    name: "Walgreens Advertising Group (WAG)",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for Walgreens Advertising Group (WAG) across onsite/offsite placements.\n      Focus on brand use standards, display constraints, and family-friendly content per WAG site and vendor display guide.\n      \n      Identify:\n      1. **Product**: Product imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity and brandmark usage. Classify as 'Logo'.\n      3. **Text**: Headlines and copy. Classify as 'Text'.\n      4. **CTA**: Call-to-action buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Verify file specs match portal requirements.\n      - Enforce brandmark usage standards.\n      - Check weight/size rules for physical displays (if applicable).\n      - Assess general content suitability (family-friendly filters).\n      - Verify brand guidelines compliance.\n      - Check in-store display constraints.\n      \n      Reference WAG site, Walgreens vendor display guide (physical), and Walgreens brand/style references.\n    ",
    complianceRules: [
      "File specs must be verified in portal and match requirements.",
      "Brandmark usage must comply with Walgreens brand standards.",
      "Weight and size rules must be followed for physical displays.",
      "Content must be family-friendly (apply family-friendly filters).",
      "Brand guidelines must be strictly followed.",
      "In-store display constraints must be respected.",
      "Creative must meet general content suitability standards.",
    ],
    imageSpecs: {
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 200,
    },
  },
  {
    id: "best-buy-ads",
    name: "Best Buy Ads",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for Best Buy Ads across onsite/offsite placements.\n      Focus on prohibited content policies, minors protection, and asset shot standards for PDP (Product Detail Pages) per Best Buy Ads policies.\n      \n      Identify:\n      1. **Product**: Product imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity. Classify as 'Logo'.\n      3. **Text**: Headlines and copy. Classify as 'Text'.\n      4. **CTA**: Call-to-action buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - **Policy Rules**: Check blocklist for prohibited content (weapons, political content, 'made for kids' targeting, skin exposure).\n      - **PDP Imagery**: Verify 300 DPI resolution, minimum 1500×1500 dimensions, white background.\n      - Assess content appropriateness for general audience.\n      - Verify no prohibited content categories are present.\n      - Check product shot quality and background compliance.\n      \n      Reference Best Buy Ads policies and Product Shot Guide from Partner Portal.\n    ",
    complianceRules: [
      "Content must not include weapons or weapon imagery.",
      "Content must not include political content or messaging.",
      "Content must not target 'made for kids' audiences inappropriately.",
      "Content must not include excessive skin exposure.",
      "PDP (Product Detail Page) imagery must be 300 DPI resolution.",
      "PDP imagery must be minimum 1500×1500 pixels.",
      "PDP imagery must have white background.",
      "Product shots must meet asset shot standards.",
      "All content must comply with Best Buy Ads prohibited content policies.",
    ],
    imageSpecs: {
      minWidth: 1500,
      minHeight: 1500,
      minDPI: 300,
      allowedFormats: ["jpg", "png"],
    },
  },
  {
    id: "home-depot-orange-apron",
    name: "Home Depot (Orange Apron Media)",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for Home Depot Orange Apron Media across onsite and offsite placements.\n      Focus on generic IAB display standards, safe-area checks, and policy framework. Note that detailed specs are partner-gated.\n      \n      Identify:\n      1. **Product**: Product imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity. Classify as 'Logo'.\n      3. **Text**: Headlines and copy. Classify as 'Text'.\n      4. **CTA**: Call-to-action buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Verify IAB standard sizes are used.\n      - Check safe-area boundaries for logos and text.\n      - Assess contrast ratios for readability.\n      - Verify CTA presence and readability.\n      - Note Orange Apron/Orange Access capabilities for context.\n      - Flag that detailed specs should be verified in partner portal.\n      \n      Reference public information on Orange Apron Media and self-serve 'Orange Access' capabilities.\n    ",
    complianceRules: [
      "Display ads must use IAB standard sizes.",
      "Logos and text must be within safe-area boundaries.",
      "Contrast ratio must meet readability standards.",
      "CTA must be present and clearly readable.",
      "Detailed specs must be verified in partner portal (specs are partner-gated).",
      "Creative should note Orange Apron/Orange Access capabilities for context.",
    ],
    imageSpecs: {
      allowedFormats: ["jpg", "png", "gif"],
      maxFileSizeKB: 150,
    },
  },
  {
    id: "albertsons-media-collective",
    name: "Albertsons Media Collective",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for Albertsons Media Collective across onsite, offsite, and in-store DOOH (Digital Out-of-Home) placements.\n      Focus on standard display/DOOH size sets, disclosure requirements, and measurement flags. Note that specs vary by channel (Criteo/partners).\n      \n      Identify:\n      1. **Product**: Product imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity. Classify as 'Logo'.\n      3. **Text**: Headlines and copy. Classify as 'Text'.\n      4. **CTA**: Call-to-action buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Verify standard display/DOOH size sets are used.\n      - Check for required disclosure/measurement flags.\n      - Verify privacy disclosures are present.\n      - Note that standardization is in progress (some specs may vary).\n      - Assess channel-specific requirements (Criteo/partners may have different specs).\n      \n      Reference standardization whitepaper, overview documentation, and 2025 press on in-store network.\n    ",
    complianceRules: [
      "Display ads must use standard display/DOOH size sets.",
      "Required disclosure/measurement flags must be present.",
      "Privacy disclosures must be included.",
      "Note that standardization is in progress (specs may vary by channel).",
      "Channel-specific requirements must be verified (Criteo/partners may differ).",
      "In-store DOOH placements must meet physical display specifications.",
    ],
    imageSpecs: {
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 200,
    },
  },
  {
    id: "loblaw-advance",
    name: "Loblaw Advance",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for Loblaw Advance media placements.\n      Focus on compliance with Loblaw Advance's prohibited activities, categories, and products policy.\n      \n      Identify:\n      1. **Product**: Product imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity. Classify as 'Logo'.\n      3. **Text**: Headlines and copy. Classify as 'Text'.\n      4. **CTA**: Call-to-action buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Verify content complies with all applicable laws and regulations for all locations where ads are showing.\n      - Check for prohibited content categories (health, drugs, weapons, adult content, etc.).\n      - Verify no misleading or false content is present.\n      - Assess appropriateness for general audience.\n      - Check for intellectual property and trademark compliance.\n      \n      Reference Loblaw Advance Policy on Prohibited Activities, Categories, and Products.\n    ",
    complianceRules: [
      "Ads must comply with all applicable laws and regulations for all the locations where the ads are showing.",
      "Products or services relating to physical or mental health conditions, including diseases, disease diagnostic kits, sexual health, and chronic health conditions, are prohibited.",
      "Ads must not promote the sale or use of illegal, prescription, or recreational drugs.",
      "Products or devices intended for pregnancy/fertility (e.g., pregnancy tests, fertility products, folic acid) are prohibited.",
      "Medical condition-related data cannot be used where not already prohibited.",
      "Alcohol products must be sold in Loblaw retail stores and cannot use past alcohol purchase history to build an audience for ad serving purposes.",
      "Ads may not promote gambling services.",
      "Ads must not promote tobacco products.",
      "Ads must not promote marijuana purchases or products, including CBD products.",
      "Ads must not promote pornography or related adult content.",
      "Ads must not promote weapons, ammunition, or explosives.",
      "Ads may not promote the sale of spy cams, mobile phone trackers, or other hidden surveillance equipment.",
      "Ads must not promote products or items that facilitate or encourage unauthorized access to digital media.",
      "Products or services relating to sexual orientation, personal race or ethnicity, personal religious beliefs, or political affiliations are prohibited.",
      "Images or representations of people that display partially exposed sexual body parts such as breasts, genitals, or buttocks are prohibited.",
      "Ads must not contain shocking, sensational, disrespectful, or excessively violent content.",
      "Ads, landing pages, and business practices must not contain deceptive, false, or misleading content, including deceptive claims, offers, or methods.",
      "Ads must not contain content that exploits controversial political or social issues for commercial purposes, including political opinion, religious belief, or advocacy.",
      "Ads must not contain profanity or bad grammar and punctuation. Symbols, numbers, and letters must be used properly without the intention of circumventing ad review processes.",
      "Ads must not contain 'before-and-after' images or images that contain unexpected or unlikely results. Ad content must not imply or attempt to generate negative self-perception to promote diet, weight loss, or other health-related products.",
      "Ads must not incite violence or intolerance, or advocate or discriminate against a protected group, whether based on race, color, national origin, religion, disability, sex, sexual orientation, age, or another category.",
      "Ads must not infringe or violate any third-party intellectual property (trademark/copyright) rights.",
    ],
    imageSpecs: {
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 300,
    },
    localizationRules: [
      {
        region: "CA",
        language: "en",
        rules: [
          "All pricing must be displayed in Canadian dollars (CAD).",
          "French language version may be required for Quebec markets.",
          "Must comply with Canadian Competition Act for advertising claims.",
          "Health claims must comply with Health Canada regulations.",
        ],
      },
      {
        region: "CA",
        language: "fr",
        rules: [
          "Quebec ads must be primarily in French per Bill 96 requirements.",
          "French text must be at least as prominent as English text.",
          "All legal disclaimers must be available in French.",
          "Product names may remain in English if trademarked.",
        ],
      },
    ],
  },
  {
    id: "uber-eats-ads",
    name: "Uber Eats Ads",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for Uber Eats advertising placements.\n      Focus on food imagery quality, brand guidelines, and promotional content compliance.\n      \n      Identify:\n      1. **Product**: Food/restaurant imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Restaurant brand and Uber Eats branding. Classify as 'Logo'.\n      3. **Text**: Promotional copy, pricing, delivery info. Classify as 'Text'.\n      4. **CTA**: Order buttons, delivery CTAs. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Verify food imagery is appetizing and high-quality.\n      - Check Uber Eats logo usage guidelines compliance.\n      - Verify promotional offers are clearly stated with terms.\n      - Assess delivery time claims for accuracy.\n      - Check for required legal disclaimers.\n    ",
    complianceRules: [
      "Food imagery must be high-quality, appetizing, and accurately represent the product.",
      "Uber Eats logo must be used according to brand guidelines.",
      "Promotional offers must clearly display terms and conditions.",
      "Delivery time estimates must be realistic and include disclaimers.",
      "Restaurant partner logos must not be altered or distorted.",
      "Pricing must be accurate and include any additional fees disclosure.",
      "Content must not make false claims about food quality or ingredients.",
      "Alcohol ads must comply with local regulations and age-gating requirements.",
      "No competitor brand mentions or comparisons without approval.",
      "All claims about 'free delivery' or 'fastest delivery' must be substantiated.",
    ],
    imageSpecs: {
      minWidth: 1080,
      aspectRatios: ["1:1", "4:5", "16:9"],
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 500,
    },
    localizationRules: [
      {
        region: "US",
        rules: [
          "Prices must be in USD.",
          "Alcohol advertising must comply with TTB regulations.",
          "Delivery fee disclaimers required in most states.",
        ],
      },
      {
        region: "UK",
        rules: [
          "Prices must be in GBP.",
          "HFSS (High Fat, Sugar, Salt) advertising restrictions apply.",
          "Alcohol ads must include 'Drink Responsibly' messaging.",
        ],
      },
    ],
  },
  {
    id: "doordash-ads",
    name: "DoorDash Ads",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for DoorDash advertising and sponsored listings.\n      Focus on restaurant promotion, delivery messaging, and platform brand compliance.\n      \n      Identify:\n      1. **Product**: Food imagery and restaurant content. Classify as 'Product'.\n      2. **Brand/Logo**: DoorDash and restaurant branding. Classify as 'Logo'.\n      3. **Text**: Promotional messaging, offers, descriptions. Classify as 'Text'.\n      4. **CTA**: Order and delivery action buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Verify DoorDash brand guidelines compliance.\n      - Check food photography quality standards.\n      - Assess promotional offer clarity and terms.\n      - Verify delivery promise accuracy.\n      - Check for DashPass promotional compliance if applicable.\n    ",
    complianceRules: [
      "DoorDash logo must follow official brand guidelines.",
      "Food photography must be professional and accurately represent dishes.",
      "Promotional offers must include clear terms and expiration dates.",
      "Delivery estimates must be realistic with appropriate disclaimers.",
      "DashPass promotions must clearly indicate membership requirements.",
      "Restaurant ratings and reviews must be current and accurate.",
      "No misleading claims about delivery speed or service quality.",
      "Pricing must be transparent including service fees.",
      "Alcohol delivery ads must include age verification requirements.",
      "Partner restaurant content must be approved and current.",
    ],
    imageSpecs: {
      minWidth: 1200,
      aspectRatios: ["1:1", "16:9"],
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 400,
    },
  },
  {
    id: "lowes-oneroof",
    name: "Lowe's OneRoof Media",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for Lowe's OneRoof Media retail media network.\n      Focus on home improvement product presentation, DIY content, and brand safety.\n      \n      Identify:\n      1. **Product**: Home improvement products, tools, materials. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity and Lowe's co-branding. Classify as 'Logo'.\n      3. **Text**: Product descriptions, pricing, promotional copy. Classify as 'Text'.\n      4. **CTA**: Shop now, add to cart buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Verify product imagery meets quality standards.\n      - Check for accurate product specifications and dimensions.\n      - Assess safety warnings and disclaimers for applicable products.\n      - Verify pricing accuracy and promotional terms.\n      - Check brand guidelines compliance.\n    ",
    complianceRules: [
      "Product imagery must be high-resolution and accurately represent the item.",
      "Product specifications (dimensions, materials) must be accurate.",
      "Safety warnings must be included for power tools and hazardous materials.",
      "Pricing must be current and match in-store/online prices.",
      "Installation claims must be realistic with appropriate disclaimers.",
      "Pro services promotions must clearly state terms and availability.",
      "Seasonal/promotional pricing must include valid date ranges.",
      "DIY project imagery must show proper safety equipment usage.",
      "Brand logos must not be altered or placed on unapproved backgrounds.",
      "Environmental claims must be substantiated and compliant with FTC Green Guides.",
    ],
    imageSpecs: {
      minWidth: 1000,
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 300,
    },
  },
  {
    id: "dollar-general-media",
    name: "Dollar General Media Network",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for Dollar General Media Network placements.\n      Focus on value messaging, product accessibility, and rural market compliance.\n      \n      Identify:\n      1. **Product**: Product imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity. Classify as 'Logo'.\n      3. **Text**: Value messaging, pricing, promotions. Classify as 'Text'.\n      4. **CTA**: Shop now buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Verify pricing accuracy and value claims.\n      - Check product availability claims.\n      - Assess family-friendly content standards.\n      - Verify coupon/offer terms are clear.\n      - Check accessibility of promotional messaging.\n    ",
    complianceRules: [
      "Pricing must accurately reflect Dollar General store prices.",
      "Value claims must be substantiated and not misleading.",
      "Product availability must be verified for advertised locations.",
      "Content must be family-friendly and appropriate for all ages.",
      "Coupon and digital offer terms must be clearly displayed.",
      "DG Pickup and delivery claims must reflect actual service availability.",
      "SNAP/EBT eligible product claims must be accurate.",
      "No competitor price comparisons without substantiation.",
      "Seasonal product availability must be clearly indicated.",
      "Limited quantity offers must include appropriate disclaimers.",
    ],
    imageSpecs: {
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 200,
    },
  },
  {
    id: "ebay-advertising",
    name: "eBay Advertising",
    category: "ecommerce",
    prompt:
      "\n      Analyze this advertisement for eBay Advertising placements.\n      Focus on marketplace integrity, seller compliance, and authentic product representation.\n      \n      Identify:\n      1. **Product**: Product listings and imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Seller branding and eBay elements. Classify as 'Logo'.\n      3. **Text**: Product descriptions, pricing, shipping info. Classify as 'Text'.\n      4. **CTA**: Buy now, bid buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Verify product authenticity claims.\n      - Check pricing transparency including shipping.\n      - Assess seller rating accuracy.\n      - Verify condition descriptions are accurate.\n      - Check for prohibited items compliance.\n    ",
    complianceRules: [
      "Product images must accurately represent the actual item for sale.",
      "Pricing must include clear shipping cost information.",
      "Condition descriptions (New, Used, Refurbished) must be accurate.",
      "Authenticity claims must be verifiable for branded items.",
      "No prohibited items (weapons, counterfeit goods, etc.).",
      "Seller metrics displayed must be current and accurate.",
      "Auction vs Buy It Now must be clearly distinguished.",
      "Return policy must be clearly stated.",
      "Item location and shipping times must be accurate.",
      "No misleading 'limited time' or 'last one' claims without basis.",
    ],
    imageSpecs: {
      minWidth: 500,
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 500,
    },
  },
  {
    id: "gopuff-ads",
    name: "Gopuff Ads",
    category: "retail",
    prompt:
      "\n      Analyze this advertisement for Gopuff advertising placements.\n      Focus on instant delivery messaging, product availability, and convenience positioning.\n      \n      Identify:\n      1. **Product**: Products available for delivery. Classify as 'Product'.\n      2. **Brand/Logo**: Gopuff branding and partner brands. Classify as 'Logo'.\n      3. **Text**: Delivery messaging, pricing, offers. Classify as 'Text'.\n      4. **CTA**: Order now buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Verify delivery time claims are realistic.\n      - Check product availability by market.\n      - Assess age-restricted product compliance.\n      - Verify pricing and fee transparency.\n      - Check promotional offer terms.\n    ",
    complianceRules: [
      "Delivery time claims must be realistic for the service area.",
      "Product availability must be verified for advertised markets.",
      "Age-restricted products (alcohol, tobacco) must include verification requirements.",
      "Pricing must be transparent including delivery fees.",
      "Gopuff Fam membership benefits must be clearly explained.",
      "No false urgency or misleading stock availability claims.",
      "Partner brand usage must comply with co-marketing agreements.",
      "Late-night/24-hour service claims must reflect actual availability.",
      "Promotional codes must include clear terms and expiration.",
      "Product images must match actual items available.",
    ],
    imageSpecs: {
      minWidth: 1080,
      aspectRatios: ["1:1", "9:16", "16:9"],
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 400,
    },
  },
  {
    id: "meta-facebook-instagram",
    name: "Meta (Facebook/Instagram)",
    category: "social",
    prompt:
      "\n      Analyze this advertisement for Meta platforms (Facebook and Instagram).\n      Focus on ad policy compliance, creative specifications, and content restrictions.\n      \n      Identify:\n      1. **Product**: Product or service imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity elements. Classify as 'Logo'.\n      3. **Text**: Ad copy, headlines, descriptions. Classify as 'Text'.\n      4. **CTA**: Call-to-action buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Check text-to-image ratio (20% text rule guidance).\n      - Verify no prohibited content categories.\n      - Assess special ad category compliance if applicable.\n      - Check for discriminatory content.\n      - Verify landing page consistency.\n    ",
    complianceRules: [
      "Ad images should minimize text overlay (20% guideline for optimal performance).",
      "No prohibited content: weapons, tobacco, adult content, illegal products.",
      "Special Ad Categories (housing, employment, credit) must be properly declared.",
      "No discriminatory targeting or content based on protected characteristics.",
      "Landing pages must match ad content and claims.",
      "No misleading or sensationalized content.",
      "Health claims must not reference Facebook/Instagram endorsement.",
      "Cryptocurrency and financial services require special authorization.",
      "Before/after images for health products are prohibited.",
      "No shocking, violent, or excessively graphic content.",
      "Personal attributes targeting must not be used inappropriately.",
      "Ads for social issues, elections, or politics require authorization.",
      "No fake functionality or deceptive interactive elements.",
    ],
    imageSpecs: {
      minWidth: 1080,
      aspectRatios: ["1:1", "4:5", "9:16", "16:9", "1.91:1"],
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 30720,
    },
    localizationRules: [
      {
        region: "EU",
        rules: [
          "Must comply with GDPR for data collection.",
          "Political ads may be restricted in certain EU countries.",
          "Alcohol ads must comply with local country regulations.",
          "Must include imprint/advertiser info per DSA requirements.",
        ],
      },
      {
        region: "US",
        rules: [
          "Special Ad Categories require proper categorization.",
          "Political ads require 'Paid for by' disclaimers.",
          "State-specific alcohol advertising rules apply.",
        ],
      },
    ],
  },
  {
    id: "tiktok-ads",
    name: "TikTok Ads",
    category: "social",
    prompt:
      "\n      Analyze this advertisement for TikTok advertising placements.\n      Focus on creative authenticity, community guidelines, and platform-native feel.\n      \n      Identify:\n      1. **Product**: Product or service being promoted. Classify as 'Product'.\n      2. **Brand/Logo**: Brand elements. Classify as 'Logo'.\n      3. **Text**: Captions, overlays, hashtags. Classify as 'Text'.\n      4. **CTA**: In-video CTAs and buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Assess native/authentic feel vs overly produced.\n      - Check for prohibited content categories.\n      - Verify age-appropriate content.\n      - Check music/audio licensing compliance.\n      - Assess influencer disclosure requirements.\n    ",
    complianceRules: [
      "Content should feel native and authentic to TikTok platform.",
      "No prohibited products: weapons, tobacco, drugs, adult content.",
      "Age-restricted products must comply with targeting restrictions.",
      "Influencer/creator partnerships must include proper disclosure (#ad, #sponsored).",
      "No misleading claims or fake engagement tactics.",
      "Music and audio must be properly licensed or use TikTok library.",
      "No violent, graphic, or shocking content.",
      "Gambling ads require proper licensing and geo-restrictions.",
      "Health and beauty claims must be substantiated.",
      "No deceptive practices like fake comments or engagement.",
      "Political ads are prohibited or restricted by region.",
      "Financial services require appropriate disclaimers.",
      "No content exploiting minors or vulnerable populations.",
    ],
    imageSpecs: {
      aspectRatios: ["9:16", "1:1", "16:9"],
      allowedFormats: ["jpg", "png", "mp4"],
      maxFileSizeKB: 512000,
    },
    localizationRules: [
      {
        region: "US",
        rules: [
          "FTC influencer disclosure guidelines must be followed.",
          "Age-gating required for alcohol (21+).",
          "Sweepstakes must comply with state regulations.",
        ],
      },
      {
        region: "EU",
        rules: [
          "GDPR-compliant data practices required.",
          "Influencer disclosures must meet local advertising standards.",
          "Under 18 targeting restrictions apply.",
        ],
      },
    ],
  },
  {
    id: "google-display-network",
    name: "Google Display Network",
    category: "social",
    prompt:
      "\n      Analyze this advertisement for Google Display Network (GDN) placements.\n      Focus on Google Ads policies, responsive display specs, and brand safety.\n      \n      Identify:\n      1. **Product**: Product or service imagery. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity and logos. Classify as 'Logo'.\n      3. **Text**: Headlines, descriptions, display URLs. Classify as 'Text'.\n      4. **CTA**: Call-to-action elements. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Verify IAB standard sizes or responsive ad compliance.\n      - Check for prohibited content per Google Ads policies.\n      - Assess editorial quality standards.\n      - Verify destination relevance and functionality.\n      - Check for trademark compliance.\n    ",
    complianceRules: [
      "Must comply with Google Ads prohibited content policies.",
      "No counterfeit goods, dangerous products, or dishonest behavior.",
      "Healthcare and medicine ads require certification.",
      "Financial services must include required disclosures.",
      "Gambling ads require proper licensing and geo-targeting.",
      "Adult content is restricted and requires appropriate targeting.",
      "Editorial standards: no excessive capitalization, punctuation, or emoji.",
      "Landing pages must be functional and match ad content.",
      "No misleading claims or deceptive ad formats.",
      "Trademark usage must comply with Google's trademark policy.",
      "Political ads require verification and transparency.",
      "No malware, phishing, or unwanted software promotion.",
      "Alcohol ads must comply with local laws and targeting restrictions.",
    ],
    imageSpecs: {
      aspectRatios: ["1.91:1", "1:1", "4:5"],
      allowedFormats: ["jpg", "png", "gif"],
      maxFileSizeKB: 150,
    },
    localizationRules: [
      {
        region: "US",
        rules: [
          "Political ads require advertiser verification.",
          "Healthcare ads must comply with FDA guidelines.",
          "Financial disclaimers required for credit/lending products.",
        ],
      },
      {
        region: "EU",
        rules: [
          "GDPR consent requirements for remarketing.",
          "Cookie consent must be obtained before tracking.",
          "DSA transparency requirements for ad disclosures.",
        ],
      },
    ],
  },
  {
    id: "youtube-ads",
    name: "YouTube Ads",
    category: "social",
    prompt:
      "\n      Analyze this advertisement for YouTube video advertising.\n      Focus on video creative compliance, ad format requirements, and content policies.\n      \n      Identify:\n      1. **Product**: Product or service shown. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity in video. Classify as 'Logo'.\n      3. **Text**: Title cards, captions, overlays. Classify as 'Text'.\n      4. **CTA**: Video CTAs and companion banners. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Check video length for ad format (6s bumper, 15s, 30s, etc.).\n      - Verify content meets advertiser-friendly guidelines.\n      - Assess audio quality and clarity.\n      - Check for prohibited content.\n      - Verify companion banner compliance.\n    ",
    complianceRules: [
      "Video must meet format-specific length requirements (6s bumper, 15s, 30s, etc.).",
      "Content must be advertiser-friendly (no controversial, sensitive, or shocking content).",
      "Audio must be clear and at appropriate volume levels.",
      "No prohibited content: violence, adult content, harmful products.",
      "Skippable ads must hook viewers in first 5 seconds.",
      "Companion banners must match video content and comply with display specs.",
      "No misleading video thumbnails or titles.",
      "Healthcare and pharmaceutical ads require certification.",
      "Political ads require verification and 'Paid for by' disclosure.",
      "No flashing or strobing effects that could trigger seizures.",
      "Call-to-action overlays must be relevant and non-deceptive.",
      "Remarketing lists must comply with Google's policies.",
      "Kids content must comply with COPPA if targeting children.",
    ],
    imageSpecs: {
      aspectRatios: ["16:9", "1:1", "9:16"],
      allowedFormats: ["mp4", "mov", "jpg", "png"],
      maxFileSizeKB: 1048576,
    },
    localizationRules: [
      {
        region: "US",
        rules: [
          "COPPA compliance required for kids-directed content.",
          "FTC endorsement guidelines for influencer content.",
          "Political ad transparency database inclusion.",
        ],
      },
      {
        region: "UK",
        rules: [
          "HFSS restrictions on food advertising to children.",
          "ASA guidelines for advertising claims.",
          "Gambling ads must include responsible gambling messaging.",
        ],
      },
    ],
  },
  {
    id: "linkedin-ads",
    name: "LinkedIn Ads",
    category: "social",
    prompt:
      "\n      Analyze this advertisement for LinkedIn advertising placements.\n      Focus on B2B professionalism, thought leadership compliance, and professional network standards.\n      \n      Identify:\n      1. **Product**: Product, service, or content being promoted. Classify as 'Product'.\n      2. **Brand/Logo**: Company branding. Classify as 'Logo'.\n      3. **Text**: Ad copy, headlines, descriptions. Classify as 'Text'.\n      4. **CTA**: Action buttons and links. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Assess professional tone and B2B appropriateness.\n      - Check for prohibited content categories.\n      - Verify employment ad compliance.\n      - Check for misleading job or opportunity claims.\n      - Verify targeting compliance.\n    ",
    complianceRules: [
      "Content must maintain professional tone appropriate for business context.",
      "No prohibited content: adult content, weapons, tobacco, recreational drugs.",
      "Employment ads must not discriminate based on protected characteristics.",
      "No misleading job opportunity or income claims.",
      "Educational institution ads must be from accredited organizations.",
      "Financial services must include appropriate disclaimers.",
      "No deceptive practices like fake profiles or engagement.",
      "Healthcare ads must comply with regional regulations.",
      "Political ads must be transparent about sponsorship.",
      "No pyramid schemes or multi-level marketing misrepresentation.",
      "Testimonials must be genuine and properly disclosed.",
      "Lead gen forms must comply with privacy regulations.",
    ],
    imageSpecs: {
      aspectRatios: ["1.91:1", "1:1", "1:1.91"],
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 5120,
    },
  },
  {
    id: "pinterest-ads",
    name: "Pinterest Ads",
    category: "social",
    prompt:
      "\n      Analyze this advertisement for Pinterest advertising (Promoted Pins).\n      Focus on inspirational content, visual quality, and Pin-native aesthetics.\n      \n      Identify:\n      1. **Product**: Product or inspiration being promoted. Classify as 'Product'.\n      2. **Brand/Logo**: Brand elements. Classify as 'Logo'.\n      3. **Text**: Pin descriptions, overlays. Classify as 'Text'.\n      4. **CTA**: Shop now, learn more elements. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Assess visual quality and Pinterest aesthetic fit.\n      - Check for prohibited content categories.\n      - Verify landing page relevance.\n      - Check for misleading claims.\n      - Assess shopping ad catalog compliance.\n    ",
    complianceRules: [
      "Images must be high-quality and visually inspiring.",
      "Content should feel native to Pinterest's aspirational aesthetic.",
      "No prohibited content: adult, weapons, drugs, hate speech.",
      "Landing pages must match Pin content and claims.",
      "Shopping Pins must have accurate product information.",
      "No misleading before/after or weight loss claims.",
      "Health and wellness claims must be substantiated.",
      "No clickbait or sensationalized content.",
      "Vertical images (2:3 aspect ratio) recommended for best performance.",
      "Text overlay should be minimal and legible.",
      "Alcohol ads must comply with age-gating requirements.",
      "Financial ads require appropriate disclosures.",
    ],
    imageSpecs: {
      aspectRatios: ["2:3", "1:1", "1:2.1"],
      allowedFormats: ["jpg", "png"],
      maxFileSizeKB: 10240,
    },
  },
  {
    id: "snapchat-ads",
    name: "Snapchat Ads",
    category: "social",
    prompt:
      "\n      Analyze this advertisement for Snapchat advertising placements.\n      Focus on mobile-first creative, Gen Z appeal, and platform authenticity.\n      \n      Identify:\n      1. **Product**: Product or experience being promoted. Classify as 'Product'.\n      2. **Brand/Logo**: Brand elements. Classify as 'Logo'.\n      3. **Text**: Ad copy, stickers, overlays. Classify as 'Text'.\n      4. **CTA**: Swipe up, shop now elements. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Assess mobile-first vertical creative format.\n      - Check for age-appropriate content.\n      - Verify AR Lens/Filter brand safety.\n      - Check for prohibited categories.\n      - Assess authenticity and platform fit.\n    ",
    complianceRules: [
      "Creative must be vertical (9:16) for optimal mobile experience.",
      "Content must be appropriate for Snapchat's young user base.",
      "No prohibited content: weapons, tobacco, adult content, illegal products.",
      "AR Lenses and Filters must not be offensive or inappropriate.",
      "Alcohol ads restricted and require age verification.",
      "No deceptive swipe-up functionality or fake interface elements.",
      "Sound should be designed for sound-on experience.",
      "First 2 seconds must capture attention (no slow builds).",
      "Influencer content must include proper disclosure.",
      "Political ads require authorization and transparency.",
      "No misleading filters that alter body image deceptively.",
      "Gaming ads must accurately represent gameplay.",
    ],
    imageSpecs: {
      aspectRatios: ["9:16"],
      allowedFormats: ["jpg", "png", "mp4", "mov"],
      maxFileSizeKB: 1048576,
    },
    localizationRules: [
      {
        region: "US",
        rules: [
          "COPPA compliance for any content that might appeal to under 13.",
          "Alcohol age-gating set to 21+.",
          "FTC disclosure requirements for influencer partnerships.",
        ],
      },
    ],
  },
  {
    id: "twitter-x-ads",
    name: "X (Twitter) Ads",
    category: "social",
    prompt:
      "\n      Analyze this advertisement for X (formerly Twitter) advertising.\n      Focus on conversational tone, real-time relevance, and platform compliance.\n      \n      Identify:\n      1. **Product**: Product or service promoted. Classify as 'Product'.\n      2. **Brand/Logo**: Brand identity. Classify as 'Logo'.\n      3. **Text**: Tweet copy, hashtags, mentions. Classify as 'Text'.\n      4. **CTA**: Website cards, app install buttons. Classify as 'Button'.\n      \n      For compliance evaluation:\n      - Check character limits for ad copy.\n      - Verify no prohibited content.\n      - Assess brand safety and sensitivity.\n      - Check hashtag and mention appropriateness.\n      - Verify media card compliance.\n    ",
    complianceRules: [
      "Tweet copy must respect character limits (280 for standard).",
      "No prohibited content: violence, adult content, hate speech, illegal products.",
      "Political ads require certification and transparency labels.",
      "Hashtags must not hijack trending topics inappropriately.",
      "No spam tactics or engagement manipulation.",
      "Healthcare ads require appropriate disclaimers.",
      "Financial services must include required disclosures.",
      "No misleading website cards or deceptive preview images.",
      "Alcohol ads must comply with regional restrictions.",
      "Gambling ads require proper licensing documentation.",
      "No impersonation or misleading account representation.",
      "Sensitive categories may have placement restrictions.",
    ],
    imageSpecs: {
      aspectRatios: ["1.91:1", "1:1", "16:9"],
      allowedFormats: ["jpg", "png", "gif"],
      maxFileSizeKB: 5120,
    },
  },
];

// Theme toggle button component
const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400"
      title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
    >
      {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  );
};

const AppContent: React.FC = () => {
  // const { user, loading: authLoading, signOut } = useAuth();
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [thinkingTime, setThinkingTime] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);
  const [complianceResults, setComplianceResults] = useState<
    ComplianceResult[] | null
  >(null);
  const [isComplianceLoading, setIsComplianceLoading] = useState(false);

  // Platform Management
  const [platforms, setPlatforms] =
    useState<PlatformConfig[]>(DEFAULT_PLATFORMS);
  // Initialize platform from URL parameter immediately to avoid race condition
  const [activePlatformId, setActivePlatformId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("platform") || "default";
  });

  const fetchPlatforms = async () => {
    try {
      const res = await fetch("/api/platforms");
      if (res.ok) {
        const data = await res.json();
        setPlatforms(data);
      } else {
        // Handle 404 or other errors without crashing
        console.warn(
          "Could not fetch platforms from API, checking fallback..."
        );
        try {
          // Fallback to json file if api is 404 (static hosting)
          const staticRes = await fetch("/platforms.json");
          if (staticRes.ok) {
            const staticData = await staticRes.json();
            setPlatforms(staticData);
          }
        } catch (e) {
          console.warn("Using default fallback configuration");
        }
      }
    } catch (err) {
      console.warn("Using default fallback configuration due to network error");
      // Keep DEFAULT_PLATFORMS
    }
  };

  useEffect(() => {
    // 1. Load Platforms
    fetchPlatforms();

    // 2. Ensure platform param is in URL (state already initialized from URL)
    const params = new URLSearchParams(window.location.search);
    if (!params.has("platform")) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("platform", activePlatformId);
      window.history.replaceState({}, "", newUrl);
    }

    // 3. Check routing
    if (window.location.pathname === "/admin") {
      setShowAdmin(true);
    }

    // 4. Restore from localStorage if available
    try {
      const savedData = localStorage.getItem("adAnalyzerResults");
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed.imagePreview && parsed.analysisResult) {
          setImagePreview(parsed.imagePreview);
          setAnalysisResult(parsed.analysisResult);
          setComplianceResults(parsed.complianceResults || null);
          setAppState(AppState.SUCCESS);
          // Note: imageFile cannot be restored from localStorage
          // This is acceptable as the preview is the important part for display
        }
      }
    } catch (error) {
      console.warn("Failed to restore data from localStorage:", error);
      // Clear corrupted data
      localStorage.removeItem("adAnalyzerResults");
    }
  }, []);

  // Keep platform in sync with query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentPlatform = params.get("platform");

    // Only update URL if it's different from current query param
    if (currentPlatform !== activePlatformId) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("platform", activePlatformId);
      window.history.replaceState({}, "", newUrl);
    }
  }, [activePlatformId]);

  // Save to localStorage whenever analysis or compliance results change
  useEffect(() => {
    if (appState === AppState.SUCCESS && imagePreview && analysisResult) {
      try {
        const dataToSave = {
          imagePreview,
          analysisResult,
          complianceResults,
          platformId: activePlatformId,
          timestamp: Date.now(),
        };
        localStorage.setItem("adAnalyzerResults", JSON.stringify(dataToSave));
      } catch (error) {
        console.warn("Failed to save to localStorage:", error);
      }
    }
  }, [
    appState,
    imagePreview,
    analysisResult,
    complianceResults,
    activePlatformId,
  ]);

  // Use derived active platform, strictly falling back if ID not found
  const activePlatform =
    platforms.find((p) => p.id === activePlatformId) ||
    platforms[0] ||
    DEFAULT_PLATFORMS[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please upload a valid image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
      setImageFile(file);
      setAppState(AppState.IDLE);
      setErrorMsg(null);
      // Clear previous results when uploading new image
      setAnalysisResult(null);
      setComplianceResults(null);
      localStorage.removeItem("adAnalyzerResults");
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!imagePreview || !imageFile) return;

    setAppState(AppState.ANALYZING);
    setErrorMsg(null);

    // Start timer for thinking mode visualization
    const startTime = Date.now();
    const timer = setInterval(() => {
      setThinkingTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      // Extract base64 data (remove "data:image/jpeg;base64," prefix)
      const base64Data = imagePreview.split(",")[1];
      const mimeType = imageFile.type;

      // Use the specific prompt for the active platform
      const result = await analyzeImageWithGemini(
        base64Data,
        mimeType,
        activePlatform.prompt
      );
      setAnalysisResult(result);
      setAppState(AppState.SUCCESS);

      // Run compliance check asynchronously (don't await)
      if (
        activePlatform.complianceRules &&
        activePlatform.complianceRules.length > 0
      ) {
        setIsComplianceLoading(true);
        checkComplianceWithGemini(
          base64Data,
          mimeType,
          activePlatform.complianceRules
        )
          .then((results) => {
            setComplianceResults(results);
            setIsComplianceLoading(false);
          })
          .catch((err) => {
            console.error("Compliance check failed", err);
            setIsComplianceLoading(false);
            // Optionally set error state or handle silently
          });
      }
    } catch (err: any) {
      console.error(err);
      // Handle JSON parse errors from HTML responses
      let message = err.message || "An error occurred during analysis.";
      if (
        message.includes("Unexpected token") ||
        message.includes("is not valid JSON")
      ) {
        message =
          "API Error: The server returned an invalid response. Please check your connection or API key.";
      }
      setErrorMsg(message);
      setAppState(AppState.ERROR);
    } finally {
      clearInterval(timer);
      setThinkingTime(0);
    }
  };

  const handleReset = () => {
    setAppState(AppState.IDLE);
    setImageFile(null);
    setImagePreview(null);
    setAnalysisResult(null);
    setErrorMsg(null);
    setComplianceResults(null);
    setIsComplianceLoading(false);
    // Clear localStorage when resetting
    localStorage.removeItem("adAnalyzerResults");
  };

  // // Show loading state while checking authentication
  // if (authLoading) {
  //   return (
  //     <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
  //       <div className="text-center">
  //         <div className="w-16 h-16 border-4 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
  //         <p className="text-slate-600 dark:text-slate-400">Loading...</p>
  //       </div>
  //     </div>
  //   );
  // }

  // Show login page if not authenticated
  // if (!user) {
  //   return <Login />;
  // }

  // Render Admin Panel
  if (showAdmin) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
        <AdminPanel
          onClose={() => {
            setShowAdmin(false);
            window.history.pushState({}, "", "/");
            fetchPlatforms(); // Refresh data
          }}
          currentPlatforms={platforms}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <Sparkles className="text-white h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">
              AdAnalyzer AI
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* User Email */}
            {/* <span className="text-sm text-slate-600 dark:text-slate-400 hidden sm:block">
              {user?.email}
            </span> */}

            {/* Sign Out Button */}
            {/* <button
              onClick={signOut}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
              title="Sign Out"
            >
              <LogOut size={20} />
            </button> */}

            {/* Platform Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowPlatformDropdown(!showPlatformDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                <span>{activePlatform.name}</span>
                <ChevronDown
                  size={16}
                  className={`transition-transform ${
                    showPlatformDropdown ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showPlatformDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowPlatformDropdown(false)}
                  />
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
                    {platforms.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setActivePlatformId(p.id);
                          const newUrl = new URL(window.location.href);
                          newUrl.searchParams.set("platform", p.id);
                          window.history.pushState({}, "", newUrl);
                          setShowPlatformDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors ${
                          activePlatformId === p.id
                            ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium"
                            : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <ThemeToggle />

            <button
              onClick={() => setShowAdmin(true)}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
              title="Settings"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* IDLE STATE: Upload */}
        {appState === AppState.IDLE && !imagePreview && (
          <div className="max-w-2xl mx-auto mt-12">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-4">
                Extract logic from visual chaos
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                Upload an advertisement, flyer, or UI design. The AI will
                analyze the layout using the{" "}
                <strong className="text-indigo-600 dark:text-indigo-400">
                  {activePlatform.name}
                </strong>{" "}
                configuration.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 p-12 text-center hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors shadow-sm group">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 mb-6 group-hover:scale-110 transition-transform">
                <UploadCloud size={32} />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Upload an image to analyze
              </h3>
              <p className="text-slate-500 dark:text-slate-400 mb-8">
                Supported formats: JPEG, PNG, WEBP
              </p>

              <label className="inline-flex">
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />
                <span className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-medium transition-colors shadow-sm hover:shadow flex items-center gap-2">
                  <FileImage size={18} />
                  Select Image
                </span>
              </label>
            </div>
          </div>
        )}

        {/* IDLE STATE: Preview */}
        {appState === AppState.IDLE && imagePreview && (
          <div className="max-w-4xl mx-auto flex flex-col items-center">
            <div className="w-full bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden p-4 mb-8">
              <img
                src={imagePreview}
                alt="Preview"
                className="max-h-[60vh] mx-auto object-contain rounded-lg"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleReset}
                className="px-6 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAnalyze}
                className="px-8 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 flex items-center gap-2"
              >
                <Sparkles size={18} />
                Run Deep Analysis
              </button>
            </div>
          </div>
        )}

        {/* ANALYZING STATE */}
        {appState === AppState.ANALYZING && (
          <div className="max-w-lg mx-auto text-center mt-20">
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 border-4 border-slate-100 dark:border-slate-700 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center font-mono text-indigo-600 dark:text-indigo-400 font-bold text-lg">
                {thinkingTime}s
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">
              Analyzing visual structure...
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8">
              Thinking mode enabled. Using{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {activePlatform.name}
              </strong>{" "}
              logic to deconstruct the image.
            </p>
            <div className="mb-6 inline-block bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded font-mono text-xs text-slate-500 dark:text-slate-400">
              Platform: {activePlatformId}
            </div>

            <div className="space-y-3 max-w-xs mx-auto text-left">
              <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 animate-pulse">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Detecting text regions
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 animate-pulse delay-150">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Calculating bounding boxes
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 animate-pulse delay-300">
                <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                Categorizing visual elements
              </div>
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {appState === AppState.ERROR && (
          <div className="max-w-md mx-auto mt-20 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Analysis Failed
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-8">
              {errorMsg}
            </p>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800 rounded-lg hover:bg-slate-900 dark:hover:bg-white transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* SUCCESS STATE */}
        {appState === AppState.SUCCESS && imagePreview && analysisResult && (
          <div className="h-[calc(100vh-140px)] min-h-[600px]">
            <ResultsView
              imageSrc={imagePreview}
              analysis={analysisResult}
              onReset={handleReset}
              platformName={activePlatform.name}
              complianceRules={activePlatform.complianceRules}
              complianceResults={complianceResults}
              isComplianceLoading={isComplianceLoading}
              imageFile={imageFile}
              imageSpecs={activePlatform.imageSpecs}
            />
          </div>
        )}
      </main>
    </div>
  );
};

// Wrapper component to access theme context
const ThemedApp: React.FC = () => {
  const { theme } = useTheme();

  return (
    <ConfigProvider
      theme={{
        algorithm:
          theme === "dark"
            ? antdTheme.darkAlgorithm
            : antdTheme.defaultAlgorithm,
        token: {
          colorBgElevated: theme === "dark" ? "#1e293b" : "#ffffff",
          colorBorder: theme === "dark" ? "#475569" : "#e2e8f0",
          colorText: theme === "dark" ? "#e2e8f0" : "#1e293b",
          colorTextHeading: theme === "dark" ? "#f1f5f9" : "#0f172a",
        },
      }}
    >
      <AppContent />
    </ConfigProvider>
  );
};

// Main App component wrapped with ThemeProvider
const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
};

export default App;
