export type Job = {
  country: string;
  cityState: string;
  companyName: string;
  parentLocale: string;
  additionalWorkLocation: undefined[];
  experience: string;
  msrReqType: boolean;
  structureData: {
    hiringOrganization: {
      ['@type']: string;
      name: string
    };
    jobLocation: {
      address: {
        addressCountry: string;
        ['@type']: string;
        addressLocality: string;
        addressRegion: string
      };
      ['@type']: string
    };
    employmentType: string;
    ['@type']: string;
    description: string;
    datePosted: string;
    title: string;
    ['@context']: string;
    occupationalCategory: string
  };
  targetStandardTitle: string;
  descriptionTeaser: string;
  primaryRecruiter: string;
  primaryWorkLocation: {
    country: string;
    city: string;
    state: string
  };
  careerStage: string;
  state: string;
  externalTracking: boolean;
  siteType: string;
  internalCategoryId: string;
  stateCountry: string;
  jobId: string;
  refNum: string;
  reqType: string;
  city: string;
  description: string;
  positionNumber: string;
  locale: string;
  title: string;
  multi_location: {
    country: string;
    cityState: string;
    city: string;
    latitude: string;
    location: string;
    state: string;
    cityCountry: string;
    cityStateCountry: string;
    stateCountry: string;
    longitude: string
  }[];
  jobQualifications: string;
  postedDate: string;
  jobSeqNo: string;
  visibilitySearchType: string[];
  jobResponsibilities: string;
  onBoardingContact: string;
  benefits_and_perks: {
    displayName: string;
    id: number
  }[];
  dateCreated: string;
  educationLevel: string;
  jobUrl: string;
  internalJobPostingDescriptionNote: string;
  cityStateCountry: string;
  talentpool: string;
  requisitionHiringManager: string;
  visibilitySiteType: string[];
  isReqTypeUniversity: boolean;
  employmentType: string;
  lastModifiedDate: string;
  parentRefNum: string;
  jobSummary: string;
  jobVisibility: string[];
  jobPostingId: string;
  applyUrl: string;
  location: string;
  cityCountry: string;
  requisitionAdminContact: string;
  category: string;
  operation: string;
  requisitionTravelPercentage: string;
  requisitionRoleType: string
};

export type Results = {
  status: number;
  hits: number;
  totalHits: number;
  data: {
    jobs: {
      country: string;
      subCategory: string;
      industry: null;
      title: string;
      multi_location: string[];
      type: null;
      orgFunction: null;
      experience: string;
      locale: string;
      multi_location_array: {
        location: string
      }[];
      jobSeqNo: string;
      postedDate: string;
      searchresults_display: null;
      descriptionTeaser: string;
      dateCreated: string;
      state: string;
      jd_display: null;
      reqId: null;
      badge: string;
      jobId: string;
      isMultiLocation: boolean;
      jobVisibility: string[];
      mostpopular: number;
      location: string;
      category: string;
      locationLatlong: null
    }[];
    aggregations: {
      field: string;
      value: {
        ['United States']: number;
        India: number;
        China: number;
        ['United Kingdom']: number;
        Japan: number;
        Romania: number;
        Israel: number;
        Singapore: number;
        Canada: number;
        Ireland: number;
        Taiwan: number;
        Australia: number;
        Korea: number;
        ['Costa Rica']: number;
        Portugal: number;
        Netherlands: number;
        Norway: number;
        Estonia: number;
        France: number;
        Germany: number;
        ['Czech Republic']: number;
        Mexico: number;
        Sweden: number;
        Spain: number;
        Denmark: number;
        Switzerland: number;
        ['Hong Kong SAR']: number;
        Egypt: number;
        Jordan: number;
        Belgium: number;
        Brazil: number;
        ['United Arab Emirates']: number;
        Chile: number;
        Finland: number;
        Italy: number;
        Malaysia: number;
        Poland: number;
        Qatar: number;
        Turkey: number;
        Argentina: number;
        ['Dominican Republic']: number;
        ['New Zealand']: number;
        Nigeria: number;
        Philippines: number;
        ['Puerto Rico']: number;
        Russia: number;
        Serbia: number;
        ['South Africa']: number
      }
    }[];
    locationData: {
      place_id: string;
      latitude: string;
      longitude: string;
      aboveMaxRadius: string;
      placeVal: string
    };
    searchConfig: {
      mostpopular: boolean
    }
  };
  eid: string
};
