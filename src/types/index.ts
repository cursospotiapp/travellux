/**
 * TypeScript Interfaces para el Travel Planner
 * Estos tipos pueden usarse para validación y autocompletado
 */

// =============================================================================
// CORE TYPES
// =============================================================================

export type BudgetLevel = 'low' | 'medium' | 'high' | 'luxury';
export type IntensityLevel = 'wellness' | 'relaxed' | 'balanced' | 'active';
export type EventType =
  | 'attraction'
  | 'restaurant'
  | 'museum'
  | 'activity'
  | 'nightlife'
  | 'neighborhood'
  | 'palace'
  | 'landmark'
  | 'leisure';
export type TransportType = 'walking' | 'metro' | 'train' | 'taxi' | 'bus';
export type Currency = 'EUR' | 'USD' | 'GBP';

// =============================================================================
// HOTEL INTERFACES
// =============================================================================

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Location {
  area: string;
  description: string;
  coordinates: Coordinates;
}

export interface Price {
  amount: number;
  currency: Currency;
  period?: string;
  description?: string;
}

export interface Hotel {
  id: string;
  name: string;
  stars: number;
  location: Location;
  image: string;
  amenities: string[];
  price: Price;
  bookingUrl: string;
}

export interface HotelsDatabase {
  budget: {
    low: Hotel[];
    medium: Hotel[];
    high: Hotel[];
    luxury: Hotel[];
  };
}

// =============================================================================
// ITINERARY INTERFACES
// =============================================================================

export interface Transport {
  type: TransportType;
  duration: string;
  description: string;
}

export interface Tip {
  title: string;
  content: string;
}

export interface EventLocation {
  name: string;
  address: string;
  coordinates: Coordinates;
}

export interface Event {
  id: string;
  time: string;
  duration: string;
  title: string;
  description: string;
  type: EventType;
  location: EventLocation;
  images: string[];
  price: Price;
  tip: Tip;
  nextTransport: Transport | null;
}

export interface Day {
  dayNumber?: number;
  date?: string;
  title: string;
  theme: string;
  events: Event[];
}

export interface Itinerary {
  day1: Day;
  day2: Day;
  day3: Day;
  [key: string]: Day; // Para soportar más días dinámicamente
}

export interface ItineraryByIntensity {
  wellness?: Itinerary;
  relaxed?: Itinerary;
  balanced: Itinerary;
  active?: Itinerary;
}

export interface ItinerariesDatabase {
  destinations: {
    [city: string]: ItineraryByIntensity;
  };
}

// =============================================================================
// TRIP DATA INTERFACES
// =============================================================================

export interface UserPreferences {
  destination: string;
  startDate: string;
  endDate: string;
  budget: BudgetLevel;
  intensity: IntensityLevel;
}

export interface TripSummary {
  destination: string;
  country: string;
  duration: number;
  totalDays: number;
  departureCity: string;
  subtitle: string;
}

export interface TripData {
  tripId: string;
  userPreferences: UserPreferences;
  tripSummary: TripSummary;
  hotels: Hotel[];
  itinerary: Itinerary;
}

// =============================================================================
// COST CALCULATION INTERFACES
// =============================================================================

export interface CostBreakdown {
  hotel: number;
  activities: number;
  meals: number;
  total: number;
  currency: Currency;
}

// =============================================================================
// VALIDATION INTERFACES
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// =============================================================================
// MAP INTERFACES
// =============================================================================

export interface MapCoordinate {
  lat: number;
  lng: number;
  name: string;
  time: string;
}

// =============================================================================
// COMPONENT PROPS INTERFACES
// =============================================================================

export interface HotelCardProps {
  hotel: Hotel;
}

export interface HotelsSectionProps {
  hotels: Hotel[];
}

export interface EventCardProps {
  event: Event;
}

export interface DayItineraryProps {
  day: Day;
  dayKey: string;
}

export interface MapModalProps {
  coordinates: MapCoordinate[];
  onClose: () => void;
}

export interface TripPlannerPageProps {
  tripData?: TripData;
}

// =============================================================================
// UTILITY FUNCTION TYPES
// =============================================================================

export type GenerateTripFunction = (preferences: UserPreferences) => TripData;
export type SelectHotelsFunction = (
  budget: BudgetLevel,
  count?: number
) => Hotel[];
export type SelectItineraryFunction = (
  destination: string,
  intensity: IntensityLevel
) => Itinerary;
export type CalculateDurationFunction = (
  startDate: string,
  endDate: string
) => number;
export type GenerateTripSummaryFunction = (
  preferences: UserPreferences
) => TripSummary;
export type AddDatesToItineraryFunction = (
  itinerary: Itinerary,
  startDate: string
) => Itinerary;
export type GetDayCoordinatesFunction = (day: Day) => MapCoordinate[];
export type CalculateTotalCostFunction = (
  tripData: TripData,
  hotelNights?: number
) => CostBreakdown;
export type ValidatePreferencesFunction = (
  preferences: UserPreferences
) => ValidationResult;

// =============================================================================
// FORM INTERFACES
// =============================================================================

export interface TravelFormData {
  destination: string;
  startDate: string;
  endDate: string;
  budget: BudgetLevel;
  intensity: IntensityLevel;
}

export interface FormFieldProps {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}

export interface RadioOptionProps {
  id: string;
  name: string;
  value: string;
  label: string;
  description?: string;
  icon?: string;
  checked: boolean;
  onChange: (value: string) => void;
}

// =============================================================================
// API/DATA LOADING INTERFACES
// =============================================================================

export interface DataLoadingState {
  loading: boolean;
  error: string | null;
  data: TripData | null;
}

export interface FetchOptions {
  useCache?: boolean;
  timeout?: number;
}

// =============================================================================
// EXAMPLE USAGE IN TYPESCRIPT
// =============================================================================

/*
import type { TripData, UserPreferences, Hotel, Day } from './types';

// Component with types
const TripPlanner: React.FC<TripPlannerPageProps> = ({ tripData }) => {
  const [trip, setTrip] = useState<TripData | null>(tripData || null);
  
  useEffect(() => {
    const preferences: UserPreferences = {
      destination: "París, Francia",
      startDate: "15/12/2025",
      endDate: "18/12/2025",
      budget: "medium",
      intensity: "balanced"
    };
    
    const generatedTrip = generateTrip(preferences);
    setTrip(generatedTrip);
  }, []);
  
  return (
    <div>
      {trip && (
        <>
          <HotelsSection hotels={trip.hotels} />
          {Object.entries(trip.itinerary).map(([key, day]: [string, Day]) => (
            <DayItinerary key={key} day={day} dayKey={key} />
          ))}
        </>
      )}
    </div>
  );
};

// Helper function with types
const selectHotels: SelectHotelsFunction = (budget, count = 3) => {
  // Implementation
};
*/

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isBudgetLevel(value: string): value is BudgetLevel {
  return ['low', 'medium', 'high', 'luxury'].includes(value);
}

export function isIntensityLevel(value: string): value is IntensityLevel {
  return ['wellness', 'relaxed', 'balanced', 'active'].includes(value);
}

export function isValidTripData(data: any): data is TripData {
  return (
    typeof data === 'object' &&
    typeof data.tripId === 'string' &&
    data.userPreferences !== undefined &&
    data.tripSummary !== undefined &&
    Array.isArray(data.hotels) &&
    data.itinerary !== undefined
  );
}
