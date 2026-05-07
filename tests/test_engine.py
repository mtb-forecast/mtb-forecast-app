
import importlib.util
from pathlib import Path


def load_module():
    root = Path(__file__).resolve().parents[1]
    path = root / "mtb-forecast.py"
    spec = importlib.util.spec_from_file_location("mtb_forecast", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


m = load_module()


def trilha_base(**overrides):
    base = {
        "name": "Trilha Teste",
        "lat": -23.0,
        "lon": -46.0,
        "solo_type": "terra",
        "exposicao": "fechada",
        "altitude_m": 900,
        "trail_type": "natural",
        "regiao": "SP",
        "desnivel_m": 400,
        "extensao_km": 2.0,
        "bioma": "Mata Atlântica",
    }
    base.update(overrides)
    return base


def test_score_aumenta_com_piora_do_cenario():
    trail = trilha_base()
    leve = m.calcular_aderencia(
        rain_mm=2.0,
        acumulo_ef=1.0,
        pico_3h=1.0,
        trail=trail,
        mes=1,
        enso={"mult": 1.0},
    )
    severo = m.calcular_aderencia(
        rain_mm=12.0,
        acumulo_ef=15.0,
        pico_3h=12.0,
        trail=trail,
        mes=1,
        enso={"mult": 1.0},
    )
    assert severo["score"] > leve["score"]


def test_fator_microclima_mata_atlantica_fechada_altitude():
    trail = trilha_base()
    assert m.fator_microclima(trail) == 0.75


def test_fator_microclima_outro_bioma():
    trail = trilha_base(bioma="Cerrado")
    assert m.fator_microclima(trail) == 1.0


def test_threshold_regional_sp_vs_mg():
    sp = trilha_base(regiao="SP")
    mg = trilha_base(regiao="MG")
    enso = {"mult": 1.0}
    t_sp = m.threshold_solo_descansado(6, enso, sp)
    t_mg = m.threshold_solo_descansado(6, enso, mg)
    assert t_sp != t_mg


def test_calcular_inclinacao():
    trail = trilha_base(desnivel_m=500, extensao_km=2.0)
    assert m.calcular_inclinacao(trail) == 25.0


def test_fator_absorcao_terra_fechada_maior_que_pedra_aberta():
    terra = trilha_base(solo_type="terra", exposicao="fechada")
    pedra = trilha_base(solo_type="pedra", exposicao="aberta", bioma="Cerrado")
    assert m.fator_absorcao(terra) > m.fator_absorcao(pedra)


def test_ajustar_meia_vida_clima_reduz_com_calor_e_vento():
    trail = trilha_base(exposicao="aberta", bioma="Cerrado")
    base = 24
    ajustada = m._ajustar_meia_vida_clima(
        base,
        trail,
        temp_c=30,
        wind_ms=6,
        cloud_pct=20,
        humidity_pct=40,
    )
    assert ajustada < base


def test_ajustar_meia_vida_clima_aumenta_com_umidade_e_nuvem():
    trail = trilha_base(exposicao="fechada")
    base = 24
    ajustada = m._ajustar_meia_vida_clima(
        base,
        trail,
        temp_c=14,
        wind_ms=0.5,
        cloud_pct=95,
        humidity_pct=95,
    )
    assert ajustada > base


def test_score_baixo_em_trilha_seca():
    trail = trilha_base(solo_type="pedra", exposicao="aberta", bioma="Cerrado")
    enso = {"mult": 1.0}
    score = m.calcular_score_trilha(
        rain_mm=0.0,
        acumulo_ef=0.0,
        pico_3h=0.0,
        trail=trail,
        mes=7,
        enso=enso,
    )
    assert score["score"] < 10


def test_aderencia_seca():
    trail = trilha_base(solo_type="pedra", exposicao="aberta", bioma="Cerrado")
    ader = m.calcular_aderencia(
        rain_mm=0.0,
        acumulo_ef=0.0,
        pico_3h=0.0,
        trail=trail,
        mes=7,
        enso={"mult": 1.0},
    )
    assert ader["status"] == "SECO"


def test_aderencia_baixa_com_chuva_forte_e_solo_umido():
    trail = trilha_base(solo_type="terra", exposicao="fechada")
    ader = m.calcular_aderencia(
        rain_mm=12.0,
        acumulo_ef=15.0,
        pico_3h=12.0,
        trail=trail,
        mes=1,
        enso={"mult": 1.0},
    )
    assert ader["status"] == "BAIXA ADERÊNCIA"


def test_pedra_nao_fica_sempre_seca_em_cenario_ruim():
    trail = trilha_base(solo_type="pedra", exposicao="fechada")
    ader = m.calcular_aderencia(
        rain_mm=20.0,
        acumulo_ef=20.0,
        pico_3h=15.0,
        trail=trail,
        mes=1,
        enso={"mult": 1.0},
    )
    assert ader["status"] != "SECO"


def test_veredicto_drop_liberado_em_condicao_boa():
    trail = trilha_base(trail_type="natural", bioma="Cerrado", exposicao="aberta")
    ader = {
        "status": "GRIP PERFEITO",
        "saturado": False,
    }
    v = m.veredicto(
        aderencia=ader,
        rain_mm=0.0,
        wind_ms=2.0,
        pico_3h=0.0,
        inclinacao=8.0,
        trail=trail,
        acumulo_ef=0.0,
    )
    assert v["texto"] == "DROP LIBERADO"


def test_veredicto_melhor_esperar_em_cenario_ruim():
    trail = trilha_base(trail_type="natural")
    ader = {
        "status": "BAIXA ADERÊNCIA",
        "saturado": False,
    }
    v = m.veredicto(
        aderencia=ader,
        rain_mm=10.0,
        wind_ms=13.0,
        pico_3h=15.0,
        inclinacao=25.0,
        trail=trail,
        acumulo_ef=12.0,
    )
    assert v["texto"] == "MELHOR ESPERAR"


def test_bikepark_saturado_detecta_por_acumulo():
    trail = trilha_base(trail_type="bikepark")
    saturado = m._bikepark_saturado(
        trail=trail,
        acumulo_ef=20.0,
        mes=1,
        enso={"mult": 1.0},
    )
    assert saturado is True
