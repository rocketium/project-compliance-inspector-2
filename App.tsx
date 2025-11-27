
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
} from "lucide-react";
import { AdminPanel } from "./components/AdminPanel";

// Fallback platforms in case fetch fails
const DEFAULT_PLATFORMS: PlatformConfig[] = [
  {
    id: "default",
    name: "Default",
    prompt:
      "\n      Analyze this advertisement or design image in extreme detail.\n      \n      Your task is to decompose the image into its constituent parts for a design system.\n      Identify all distinct elements:\n      1. Text blocks (headlines, body copy, disclaimers, prices).\n      2. Visual elements (product shots, logos, icons, buttons, graphical shapes).\n      \n      For each element identified:\n      - Classify it into one of these categories: 'Text', 'Logo', 'Product', 'Button', 'Other'.\n      - Provide the exact text content (if it is text) or a concise visual description (if it is an image).\n      - precise bounding box coordinates (ymin, xmin, ymax, xmax) normalized to 0-1000 scale.\n      - A detailed polygon outline of the object's shape (list of x,y coordinates).\n      \n      Be very precise with the bounding boxes. Do not overlap boxes if possible unless elements are nested.\n      Ensure every visible piece of significant content is captured.\n    ",
  },
  {
    id: "am-fuse",
    name: "Amazon Fuse",
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
  },
  {
    id: "am-ads",
    name: "Amazon Ads",
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
  },
  {
    id: "walmart-connect",
    name: "Walmart Connect",
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
  },
  {
    id: "target-roundel",
    name: "Target Roundel",
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
  },
  {
    id: "instacart-ads",
    name: "Instacart Ads",
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
  },
  {
    id: "kroger-precision-marketing",
    name: "Kroger Precision Marketing",
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
  },
  {
    id: "cvs-media-exchange",
    name: "CVS Media Exchange (CMX)",
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
  },
  {
    id: "walgreens-advertising-group",
    name: "Walgreens Advertising Group (WAG)",
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
  },
  {
    id: "best-buy-ads",
    name: "Best Buy Ads",
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
  },
  {
    id: "home-depot-orange-apron",
    name: "Home Depot (Orange Apron Media)",
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
  },
  {
    id: "albertsons-media-collective",
    name: "Albertsons Media Collective",
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
  },
  {
    id: "loblaw-advance",
    name: "Loblaw Advance",
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
  },
];

const App: React.FC = () => {
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
  const [activePlatformId, setActivePlatformId] = useState<string>("default");

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

    // 2. Check URL for platform param
    const params = new URLSearchParams(window.location.search);
    const p = params.get("platform");
    if (p) {
      setActivePlatformId(p);
    } else {
      // If no platform in query, ensure default is in URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("platform", "default");
      window.history.replaceState({}, "", newUrl);
      setActivePlatformId("default");
    }

    // 3. Check routing
    if (window.location.pathname === "/admin") {
      setShowAdmin(true);
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
  };

  // Render Admin Panel
  if (showAdmin) {
    return (
      <div className="min-h-screen bg-slate-100 p-8">
        <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden min-h-[600px]">
          <AdminPanel
            onClose={() => {
              setShowAdmin(false);
              window.history.pushState({}, "", "/");
              fetchPlatforms(); // Refresh data
            }}
            currentPlatforms={platforms}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-1.5 rounded-lg">
                <Sparkles className="text-white h-5 w-5" />
              </div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                AdAnalyzer AI
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {/* Platform Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowPlatformDropdown(!showPlatformDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700"
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
                    <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
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
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                            activePlatformId === p.id
                              ? "bg-indigo-50 text-indigo-700 font-medium"
                              : "text-slate-700"
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => setShowAdmin(true)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-100 rounded-full"
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
              <h2 className="text-3xl font-bold text-slate-800 mb-4">
                Extract logic from visual chaos
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                Upload an advertisement, flyer, or UI design. The AI will
                analyze the layout using the{" "}
                <strong className="text-indigo-600">
                  {activePlatform.name}
                </strong>{" "}
                configuration.
              </p>
            </div>

            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center hover:border-indigo-500 transition-colors shadow-sm group">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-50 text-indigo-600 mb-6 group-hover:scale-110 transition-transform">
                <UploadCloud size={32} />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                Upload an image to analyze
              </h3>
              <p className="text-slate-500 mb-8">
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
            <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-4 mb-8">
              <img
                src={imagePreview}
                alt="Preview"
                className="max-h-[60vh] mx-auto object-contain rounded-lg"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleReset}
                className="px-6 py-3 bg-white border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAnalyze}
                className="px-8 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
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
              <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center font-mono text-indigo-600 font-bold text-lg">
                {thinkingTime}s
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-3">
              Analyzing visual structure...
            </h3>
            <p className="text-slate-500 mb-8">
              Thinking mode enabled. Using{" "}
              <strong>{activePlatform.name}</strong> logic to deconstruct the
              image.
            </p>
            <div className="mb-6 inline-block bg-slate-100 px-4 py-2 rounded font-mono text-xs text-slate-500">
              Platform: {activePlatformId}
            </div>

            <div className="space-y-3 max-w-xs mx-auto text-left">
              <div className="flex items-center gap-3 text-sm text-slate-600 animate-pulse">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Detecting text regions
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600 animate-pulse delay-150">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Calculating bounding boxes
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600 animate-pulse delay-300">
                <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                Categorizing visual elements
              </div>
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {appState === AppState.ERROR && (
          <div className="max-w-md mx-auto mt-20 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Analysis Failed
            </h3>
            <p className="text-slate-600 mb-8">{errorMsg}</p>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors"
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
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
