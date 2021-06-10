import React, { useContext, useEffect, useMemo } from "react";
import { Layer, Source } from "react-mapbox-gl";
import * as d3 from "d3";
import * as turf from "@turf/turf";

import { constants } from "constants.js";
import { Context } from "store";

const FARLayer = ({ before, layer, loadData }) => {
  const { state, dispatch } = useContext(Context);
  const { campData, destVisible, index, loading, preVisible, selectedCamp } =
    state.far;
  const selectedCampData = useMemo(
    () => campData[selectedCamp] || [],
    [campData, selectedCamp]
  );
  const selectedCampLoading = useMemo(
    () => loading[selectedCamp] || false,
    [loading, selectedCamp]
  );
  const needToLoadData = useMemo(
    () =>
      loadData &&
      selectedCamp &&
      !selectedCampData.length &&
      !selectedCampLoading,
    [loadData, selectedCamp, selectedCampData, selectedCampLoading]
  );
  let selectedCampRow = null;

  if (index && selectedCamp) {
    selectedCampRow = index.filter((row) => row.slug === selectedCamp)[0];
  }

  // Load FAR data if needed
  useEffect(() => {
    if (!needToLoadData) return;

    dispatch({
      type: "set far loading",
      camp: selectedCamp,
      loading: true,
    });

    d3.csv(`${constants.DATA_PATH}far/${selectedCamp}.csv`).then((rows) => {
      dispatch({
        type: "set far loading",
        camp: selectedCamp,
        loading: false,
      });
      dispatch({
        type: "set far camp data",
        camp: selectedCamp,
        data: rows.map((row) => ({
          ...row,
          pre_lat: +row.pre_lat,
          pre_lng: +row.pre_lng,
          dest_lat: +row.dest_lat,
          dest_lng: +row.dest_lng,
        })),
      });
    });
  }, [needToLoadData, selectedCamp, dispatch]);

  //
  // Make feature collections for points and layer
  //

  const points = useMemo(() => {
    const pointRows = [
      ...(selectedCampData
        ?.filter((row) => row.pre_lat && row.pre_lng)
        ?.map((row) => ({
          ...row,
          value: -1,
          lat: row.pre_lat,
          lng: row.pre_lng,
        })) ?? []),
      ...(selectedCampData
        ?.filter((row) => row.dest_lat && row.dest_lng)
        ?.map((row) => ({
          ...row,
          value: 1,
          lat: row.dest_lat,
          lng: row.dest_lng,
        })) ?? []),
    ];

    // Hash points by lat/lng to group them
    const hash = {};
    pointRows.forEach((r) => {
      const key = `${r.lat}|${r.lng}`;
      if (!hash[key]) hash[key] = [];
      hash[key].push(r);
    });

    return Object.values(hash).map((rows) => {
      return {
        lat: rows[0].lat,
        lng: rows[0].lng,
        value: d3.mean(rows, (d) => d.value),
        city: rows[0].value === -1 ? rows[0].pre_city : rows[0].dest_city,
        state: rows[0].value === -1 ? rows[0].pre_state : rows[0].dest_state,
        beforeCount: rows.filter(({ value }) => value === -1).length,
        afterCount: rows.filter(({ value }) => value === 1).length,
        count: rows.length,
      };
    });
  }, [selectedCampData]);

  if (!selectedCampRow) return null;

  const pointCollection = turf.featureCollection(
    points.map((point) => turf.point([point.lng, point.lat], point))
  );

  const lineCollection = turf.featureCollection(
    points.map((point) => {
      let lng0 = selectedCampRow.lng;
      let lng1 = point.lng;
      if (lng1 - lng0 >= 180) lng1 -= 360;
      return turf.greatCircle(
        turf.point([lng0, selectedCampRow.lat]),
        turf.point([lng1, point.lat]),
        {
          properties: point,
        }
      );
    })
  );

  return (
    <>
      {
        // NB: One of the layers needs to have the FAR Layer id, otherwise the
        // before prop won't work for other layers. We do this here with an
        // empty first layer.
      }
      <Source
        id={layer.id}
        geoJsonSource={{
          type: "geojson",
          data: turf.featureCollection([]),
        }}
      />
      <Layer
        type="circle"
        id={`${layer.id}`}
        sourceId={`${layer.id}`}
        before={before}
        paint={{}}
      />

      <Source
        id={`${layer.id}-lines`}
        geoJsonSource={{
          type: "geojson",
          data: lineCollection,
        }}
      />
      <Layer
        type="line"
        id={`${layer.id}-lines`}
        sourceId={`${layer.id}-lines`}
        before={before}
        paint={{
          "line-width": 1,
          "line-color": [
            "interpolate",
            ["linear"],
            ["get", "value"],
            -1,
            "#e3cd68",
            0,
            "green",
            1,
            "#86d5e3",
          ],
          "line-opacity": 0.25,
        }}
        layout={{
          visibility: preVisible ? "visible" : "none",
        }}
      />

      <Source
        id={`${layer.id}-points`}
        geoJsonSource={{
          type: "geojson",
          data: pointCollection,
        }}
      />
      <Layer
        type="circle"
        id={`${layer.id}-points`}
        sourceId={`${layer.id}-points`}
        before={before}
        paint={{
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "count"],
            5,
            3,
            50,
            10,
          ],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "value"],
            -1,
            "#e3cd68",
            0,
            "green",
            1,
            "#86d5e3",
          ],
        }}
        layout={{
          visibility: destVisible ? "visible" : "none",
        }}
      />
    </>
  );
};

export default FARLayer;
