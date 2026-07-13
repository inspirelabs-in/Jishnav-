from vertical_classifier import clean_redundant_verticals

def test_clean_redundant_verticals_empty():
    assert clean_redundant_verticals([]) == []
    assert clean_redundant_verticals(None) is None

def test_clean_redundant_verticals_single():
    assert clean_redundant_verticals([2086]) == [2086]
    assert clean_redundant_verticals([2075]) == [2075]

def test_clean_redundant_verticals_no_redundancy():
    # Flight (2087) and Hotel (2088) are both leaf categories (neither is parent of other)
    assert clean_redundant_verticals([2087, 2088]) == [2087, 2088]

def test_clean_redundant_verticals_with_parent_and_child():
    # Travel (2075) is parent of Bus (2086)
    # The parent (2075) should be removed, leaving only the child (2086)
    assert clean_redundant_verticals([2086, 2075]) == [2086]
    assert clean_redundant_verticals([2075, 2086]) == [2086]

def test_clean_redundant_verticals_multiple_children_and_parent():
    # Travel (2075) is parent of Bus (2086) and Flight (2087)
    assert clean_redundant_verticals([2086, 2087, 2075]) == [2086, 2087]

def test_clean_redundant_verticals_other_domains():
    # Food (2062) is parent of Food Delivery (2169)
    assert clean_redundant_verticals([2169, 2062]) == [2169]

    # Electronics (2056) is parent of Mobiles (2082) and Laptops (2090)
    assert clean_redundant_verticals([2082, 2090, 2056]) == [2082, 2090]
