from fastapi import APIRouter, HTTPException

from api.schemas.process import ProcessRequest, ProcessResponse, ProcessGraph
from api.routes.upload import get_session_path
from core.parser import parse_event_log
from core.miner import build_process_graph
from core.variants import extract_variants
from core.filters import apply_filters

router = APIRouter()


@router.post("/process", response_model=ProcessResponse)
def process_event_log(request: ProcessRequest):
    file_path = get_session_path(request.session_id)

    try:
        df = parse_event_log(file_path, request.column_mapping)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if df.empty:
        raise HTTPException(status_code=422, detail="No events remain after applying filters.")

    try:
        df = apply_filters(df, request.filters, request.column_mapping)

        if df.empty:
            raise ValueError("No events remain after applying the selected filters.")

        graph_result = build_process_graph(df)
        variants_result = extract_variants(df)

        # Apply min_edge_frequency: remove edges below the threshold post-construction
        graph = graph_result["graph"]
        min_freq = request.filters.min_edge_frequency
        if min_freq and min_freq > 1:
            graph = ProcessGraph(
                nodes=graph.nodes,
                edges=[e for e in graph.edges if e.count >= min_freq],
            )

        return ProcessResponse(
            graph=graph,
            variants=variants_result["variants"],
            summary=graph_result["summary"],
            available_activities=graph_result["available_activities"],
            available_dimensions=graph_result["available_dimensions"],
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")
