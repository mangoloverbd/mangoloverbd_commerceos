import { describe, expect, it } from "vitest";
import { BD_DISTRICTS, detectDistrict } from "@/lib/bdDistricts";

describe("detectDistrict", () => {
  it("matches English and Bengali district names", () => {
    expect(detectDistrict("House 12, Road 5, Dhanmondi, Dhaka")).toBe("Dhaka");
    expect(detectDistrict("বাসা ৩, গাজীপুর")).toBe("Gazipur");
    expect(detectDistrict("Chittagong GEC Circle")).toBe("Chattogram");
  });

  it("maps areas to districts even when the district is not written", () => {
    expect(detectDistrict("House 7, Dhanmondi")).toBe("Dhaka");
    expect(detectDistrict("Tongi, Station Road")).toBe("Gazipur");
  });

  it("prefers learned aliases and returns null when unknown", () => {
    expect(detectDistrict("Somewhere New", { "somewhere new": "Sylhet" })).toBe("Sylhet");
    expect(detectDistrict("Somewhere New", { "somewhere new": null })).toBe(null);
    expect(detectDistrict("")).toBe(null);
    expect(detectDistrict(null)).toBe(null);
  });

  it("covers all 64 districts", () => {
    expect(BD_DISTRICTS).toHaveLength(64);
  });

  it("catches misspelled district names from real order addresses", () => {
    expect(detectDistrict("Narayangonj chasara dit market")).toBe("Narayanganj");
    expect(detectDistrict("Loxmankhola.Bander.Narayanrgonj, BD")).toBe("Narayanganj");
    expect(detectDistrict("তারটিয়া Pachila bazar, salonga, sirajgonj, BD")).toBe("Sirajganj");
    expect(detectDistrict("Gopalgonj, Kotwalipara, unique clinic")).toBe("Gopalganj");
  });

  it("matches across unicode encodings and inserted spaces", () => {
    expect(detectDistrict("বাতানিয়া, সেনবাগ, নোয়াখালী।")).toBe("Noakhali");
    expect(detectDistrict("সলিমগঞ্চ থানা নবিনগর জেলা বি বাড়ীয়া")).toBe("Brahmanbaria");
    expect(detectDistrict("বী বাড়িয়া সুজন লেডিস্ টেইলার্স সরাইল")).toBe("Brahmanbaria");
  });

  it("matches Bengali area names to their districts", () => {
    expect(detectDistrict("উত্তর বাড্ডা আলীর মোড়")).toBe("Dhaka");
    expect(detectDistrict("জামাল উদ্দিন গার্ডেন সিটি, উত্তরখান, উত্তরা")).toBe("Dhaka");
    expect(detectDistrict("বাসা নং ৭৯,রহমতবাগ,কামরাঙ্গীরচর।")).toBe("Dhaka");
    expect(detectDistrict("পুঠিয়া তারাপুর")).toBe("Rajshahi");
    expect(detectDistrict("কাশিনাথপুর নতুন ভরেঙ্গা")).toBe("Pabna");
  });
});
