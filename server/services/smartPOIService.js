/**
 * Smart POI Service - Wikipedia-filtered POI selection with geographic clustering
 *
 * Algorithm:
 * 1. Calculate total POIs = days × poisPerDay (based on intensity)
 * 2. Fetch Wikipedia-filtered POIs from OpenStreetMap (high quality only)
 * 3. Select TOP N POIs by relevanceScore
 * 4. Divide city into N geographic phases using K-means clustering
 * 5. Assign poisPerDay closest POIs to each phase
 * 6. Optimize route within each phase using nearest-neighbor
 */

import { fetchPOIsFromCity } from './overpassService.js';

/**
 * Intensity configuration
 */
const INTENSITY_CONFIG = {
  relaxed: {
    poisPerDay: 4, // Relaxed: 4 POIs per day
    totalDays: 3,
  },
  balanced: {
    poisPerDay: 6, // Balanced: 6 POIs per day
    totalDays: 4,
  },
  active: {
    poisPerDay: 7, // Active: 7 POIs per day
    totalDays: 5,
  },
};

class SmartPOIService {
  /**
   * Main method: Get POIs for a complete trip
   *
   * @param {string} destination - City name
   * @param {Object} preferences - User preferences { intensity, interests, days }
   * @returns {Promise<Object>} POIs organized by day
   */
  async getPOIsForTrip(destination, preferences) {
    const {
      intensity = 'balanced',
      interests = ['history', 'culture'],
      days,
    } = preferences;

    console.log(
      '\n[SMART-POI] ========== Wikipedia-Filtered POI Algorithm =========='
    );
    console.log(`[SMART-POI] Destination: ${destination}`);
    console.log(`[SMART-POI] Intensity: ${intensity}`);
    console.log(`[SMART-POI] Days: ${days}`);

    try {
      const config = INTENSITY_CONFIG[intensity] || INTENSITY_CONFIG.balanced;
      const poisPerDay = config.poisPerDay;
      const numDays = days || config.totalDays;
      const totalPOIsNeeded = poisPerDay * numDays;

      console.log(
        `[SMART-POI] Formula: ${numDays} days × ${poisPerDay} POIs/day = ${totalPOIsNeeded} total\n`
      );

      // STEP 1: Fetch Wikipedia-filtered POIs
      console.log(`[SMART-POI] STEP 1: Fetching Wikipedia-filtered POIs...`);
      const allPOIs = await fetchPOIsFromCity(destination, {
        interests,
        limit: totalPOIsNeeded * 3, // 3x margin for deduplication
      });

      console.log(
        `[SMART-POI] ✓ Retrieved ${allPOIs.length} Wikipedia-quality POIs`
      );

      if (allPOIs.length === 0) {
        throw new Error('No Wikipedia-quality POIs found');
      }

      // STEP 2: Deduplicate
      console.log(`[SMART-POI] STEP 2: Deduplicating...`);
      const deduplicated = this.deduplicatePOIs(allPOIs);
      console.log(`[SMART-POI] ✓ ${deduplicated.length} unique POIs`);

      // STEP 3: Select TOP N by relevanceScore
      console.log(
        `[SMART-POI] STEP 3: Selecting TOP ${totalPOIsNeeded} by relevanceScore...`
      );
      const topPOIs = deduplicated
        .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        .slice(0, totalPOIsNeeded);

      const avgScore =
        topPOIs.reduce((sum, p) => sum + (p.relevanceScore || 0), 0) /
        topPOIs.length;
      console.log(
        `[SMART-POI] ✓ Selected ${
          topPOIs.length
        } POIs (avg score: ${avgScore.toFixed(1)})`
      );
      console.log(
        `[SMART-POI] Top 5: ${topPOIs
          .slice(0, 5)
          .map((p) => p.name)
          .join(', ')}`
      );

      // STEP 4: Divide city into N geographic phases (K-means clustering)
      console.log(
        `[SMART-POI] STEP 4: K-means clustering into ${numDays} phases...`
      );
      const phases = this.kMeansGeographic(topPOIs, numDays);
      console.log(`[SMART-POI] ✓ Created ${phases.length} phases`);

      // STEP 5: Assign POIs to each phase with better distance validation
      console.log(
        `[SMART-POI] STEP 5: Assigning ${poisPerDay} POIs to each phase...`
      );
      const dayByDay = {};
      let remainingPOIs = [...topPOIs];

      phases.forEach((phase, idx) => {
        const dayNum = idx + 1;

        // Sort remaining POIs by distance to phase center
        const poisByDistance = remainingPOIs
          .map((poi) => ({
            poi,
            distance: this.geographicDistance(poi.coordinates, phase.center),
          }))
          .sort((a, b) => a.distance - b.distance);

        // Select N closest POIs
        const dayPOIs = poisByDistance
          .slice(0, poisPerDay)
          .map((item) => item.poi);

        // Remove assigned POIs
        remainingPOIs = remainingPOIs.filter((poi) => !dayPOIs.includes(poi));

        // Optimize route (nearest-neighbor)
        const optimizedRoute = this.optimizeRoute(dayPOIs);

        // Calculate statistics
        const dayDistances = [];
        for (let i = 0; i < optimizedRoute.length - 1; i++) {
          const dist = this.geographicDistance(
            optimizedRoute[i].coordinates,
            optimizedRoute[i + 1].coordinates
          );
          dayDistances.push(dist);
        }

        const maxDist = dayDistances.length > 0 ? Math.max(...dayDistances) : 0;
        const avgDist =
          dayDistances.length > 0
            ? dayDistances.reduce((a, b) => a + b, 0) / dayDistances.length
            : 0;

        dayByDay[`day${dayNum}`] = {
          dayNumber: dayNum,
          zone: `Sector ${dayNum}`,
          center: phase.center,
          pois: optimizedRoute,
          poisCount: optimizedRoute.length,
        };

        console.log(
          `[SMART-POI]   Day ${dayNum}: ${
            optimizedRoute.length
          } POIs (max dist: ${maxDist.toFixed(2)}km, avg: ${avgDist.toFixed(
            2
          )}km)`
        );
        console.log(
          `[SMART-POI]     ${optimizedRoute.map((p) => p.name).join(' → ')}`
        );
      });

      // ❌ ELIMINADO: Las búsquedas de restaurantes saturan la API de Overpass
      // TODO: Implementar con caché local o usar API de Google Places

      // 🔥 STEP 6: Obtener imágenes SOLO de los POIs seleccionados
      console.log('[SMART-POI] STEP 6: Fetching images for selected POIs...');
      const allSelectedPOIs = Object.values(dayByDay).flatMap(
        (day) => day.pois
      );
      const { enrichPOIsWithImages } = await import('./overpassService.js');
      await enrichPOIsWithImages(allSelectedPOIs);

      const totalAssigned = Object.values(dayByDay).reduce(
        (sum, day) => sum + day.poisCount,
        0
      );
      console.log(`[SMART-POI] ✓ Complete: ${totalAssigned} POIs assigned\n`);

      return {
        dayByDay,
        stats: {
          total: totalAssigned,
          avgRelevanceScore: avgScore.toFixed(1),
          poisPerDay: poisPerDay,
          days: Object.keys(dayByDay).length,
        },
      };
    } catch (error) {
      console.error('[SMART-POI] Error:', error.message);
      throw error;
    }
  }

  /**
   * Deduplicate POIs by name and proximity (< 100m)
   * @private
   */
  deduplicatePOIs(pois) {
    const unique = [];
    const seen = new Set();

    for (const poi of pois) {
      const nameKey = poi.name.toLowerCase().trim();

      if (seen.has(nameKey)) continue;

      const hasDuplicate = unique.some((existing) => {
        if (!existing.coordinates || !poi.coordinates) return false;
        const distance = this.geographicDistance(
          existing.coordinates,
          poi.coordinates
        );
        return distance < 0.1; // 100 meters
      });

      if (!hasDuplicate) {
        unique.push(poi);
        seen.add(nameKey);
      }
    }

    return unique;
  }

  /**
   * K-means geographic clustering
   * @private
   */
  kMeansGeographic(pois, k) {
    const maxIterations = 10;

    // Initialize centroids
    let centroids = this.initializeCentroids(pois, k);

    // K-means iterations
    for (let iter = 0; iter < maxIterations; iter++) {
      const assignments = pois.map((poi) => {
        let minDist = Infinity;
        let closestIdx = 0;

        centroids.forEach((centroid, idx) => {
          const dist = this.geographicDistance(poi.coordinates, centroid);
          if (dist < minDist) {
            minDist = dist;
            closestIdx = idx;
          }
        });

        return closestIdx;
      });

      // Recalculate centroids
      const newCentroids = [];
      for (let i = 0; i < k; i++) {
        const clusterPOIs = pois.filter((_, idx) => assignments[idx] === i);

        if (clusterPOIs.length === 0) {
          newCentroids.push(centroids[i]);
        } else {
          const avgLat =
            clusterPOIs.reduce((sum, p) => sum + p.coordinates.lat, 0) /
            clusterPOIs.length;
          const avgLng =
            clusterPOIs.reduce((sum, p) => sum + p.coordinates.lng, 0) /
            clusterPOIs.length;
          newCentroids.push({ lat: avgLat, lng: avgLng });
        }
      }

      centroids = newCentroids;
    }

    // Final assignment
    const clusters = [];
    for (let i = 0; i < k; i++) {
      const clusterPOIs = pois.filter((poi) => {
        let minDist = Infinity;
        let closestIdx = 0;

        centroids.forEach((centroid, idx) => {
          const dist = this.geographicDistance(poi.coordinates, centroid);
          if (dist < minDist) {
            minDist = dist;
            closestIdx = idx;
          }
        });

        return closestIdx === i;
      });

      if (clusterPOIs.length > 0) {
        clusters.push({
          center: centroids[i],
          pois: clusterPOIs,
        });
      }
    }

    return clusters;
  }

  /**
   * Optimize route using nearest-neighbor (avoid zig-zag)
   * @private
   */
  optimizeRoute(pois) {
    if (pois.length <= 1) return pois;

    const route = [pois[0]];
    const remaining = [...pois.slice(1)];

    while (remaining.length > 0) {
      const current = route[route.length - 1];
      let nearestIdx = 0;
      let minDist = Infinity;

      remaining.forEach((poi, idx) => {
        const dist = this.geographicDistance(
          current.coordinates,
          poi.coordinates
        );
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = idx;
        }
      });

      route.push(remaining[nearestIdx]);
      remaining.splice(nearestIdx, 1);
    }

    return route;
  }

  /**
   * Initialize K-means centroids using K-means++ algorithm
   * (Ensures centroids are well-distributed geographically)
   * @private
   */
  initializeCentroids(pois, k) {
    if (pois.length === 0) return [];

    const centroids = [];

    // 1. Choose first centroid randomly from POIs
    const firstIdx = Math.floor(Math.random() * pois.length);
    centroids.push({ ...pois[firstIdx].coordinates });

    // 2. For each subsequent centroid, choose POI furthest from existing centroids
    while (centroids.length < k) {
      let maxDist = -1;
      let furthestIdx = 0;

      pois.forEach((poi, idx) => {
        // Find minimum distance to existing centroids
        const minDistToCentroid = Math.min(
          ...centroids.map((centroid) =>
            this.geographicDistance(poi.coordinates, centroid)
          )
        );

        // Select POI with maximum minimum distance (furthest from all centroids)
        if (minDistToCentroid > maxDist) {
          maxDist = minDistToCentroid;
          furthestIdx = idx;
        }
      });

      centroids.push({ ...pois[furthestIdx].coordinates });
    }

    console.log(
      `[SMART-POI] K-means++ initialized ${k} centroids with avg separation: ${this.calculateAvgSeparation(
        centroids
      ).toFixed(2)}km`
    );
    return centroids;
  }

  /**
   * Calculate average separation between centroids
   * @private
   */
  calculateAvgSeparation(centroids) {
    if (centroids.length <= 1) return 0;

    let totalDist = 0;
    let count = 0;

    for (let i = 0; i < centroids.length; i++) {
      for (let j = i + 1; j < centroids.length; j++) {
        totalDist += this.geographicDistance(centroids[i], centroids[j]);
        count++;
      }
    }

    return count > 0 ? totalDist / count : 0;
  }

  /**
   * Calculate geographic distance using Haversine formula
   * @private
   */
  geographicDistance(coord1, coord2) {
    const R = 6371; // Earth radius in km
    const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
    const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((coord1.lat * Math.PI) / 180) *
        Math.cos((coord2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export default new SmartPOIService();
