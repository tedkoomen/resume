#pragma once

#include <concepts>
#include <cstdint>
#include <bit>

template <std::size_t N>
concept IsPositivePowerOfTwo = (N > 0) && std::has_single_bit(N);
